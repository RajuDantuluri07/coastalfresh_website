const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

/**
 * Creates an alert document and sends a push notification to the farm owner.
 * @param {object} alertData The data for the alert.
 */
async function createAlertAndNotify(alertData) {
    const { farmId, tankId, type, level, message } = alertData;

    // 1. Prevent duplicate alerts for the same issue on the same day.
    const alertId = `${type}_${tankId}_${new Date().toISOString().split('T')[0]}`;
    const alertRef = db.collection('alerts').doc(alertId);
    const alertDoc = await alertRef.get();
    if (alertDoc.exists) {
        console.log(`Alert ${alertId} already exists. Skipping.`);
        return null;
    }

    // 2. Get the farm owner's ID (Required for Data Ownership & Notification)
    const farmDoc = await db.collection('farms').doc(farmId).get();
    if (!farmDoc.exists) {
        console.error(`Farm ${farmId} not found.`);
        return null;
    }
    const ownerId = farmDoc.data().ownerId;

    // 3. Save the new alert to Firestore with ownerId (Ticket 1).
    await alertRef.set({
        ...alertData,
        ownerId,
        status: 'new',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Alert ${alertId} created.`);

    // 4. Get all saved notification tokens for the owner.
    const tokensSnap = await db.collection('users').doc(ownerId).collection('fcmTokens').get();
    if (tokensSnap.empty) {
        console.log(`No FCM tokens found for user ${ownerId}.`);
        return null;
    }
    const tokens = tokensSnap.docs.map(doc => doc.data().token);

    // 5. Construct and send the push notification.
    const messagePayload = {
        tokens: tokens,
        notification: {
            title: `AquaRythu Alert: ${level.toUpperCase()}`,
            body: message,
        },
        data: {
            screen: 'home', // Tells the app which screen to open on click
            tankId: tankId
        }
    };

    const response = await admin.messaging().sendEachForMulticast(messagePayload);
    console.log(`Successfully sent message to ${response.successCount} devices.`);

    // 6. Clean up any invalid or expired tokens.
    const tokensToRemove = [];
    response.responses.forEach((result, index) => {
        const error = result.error;
        if (error) {
            console.error('Failure sending notification to', tokens[index], error);
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                tokensToRemove.push(tokensSnap.docs[index].ref.delete());
            }
        }
    });
    return Promise.all(tokensToRemove);
}

/**
 * Triggered when a new feed entry is created.
 * Checks for disease risk (3 consecutive feeds with leftovers).
 */
exports.onFeedEntryCreate = functions.firestore
    .document('feedEntries/{entryId}')
    .onCreate(async (snap, context) => {
        const entry = snap.data();
        const { tankId, farmId, date, amount } = entry;

        const farmDoc = await db.collection('farms').doc(farmId).get();
        if (!farmDoc.exists) {
            console.error(`Farm ${farmId} not found.`);
            return null;
        }
        const farmData = farmDoc.data();

        // 1. SECURITY: Verify User Role (Defense in Depth)
        if (context.auth) {
            const uid = context.auth.uid;
            const isOwner = farmData.ownerId === uid;
            if (!isOwner) {
                const memberDoc = await db.collection('farms').doc(farmId).collection('members').doc(uid).get();
                const isWorker = memberDoc.exists && memberDoc.data().role === 'worker';
                if (!isWorker) {
                    console.warn(`User ${uid} unauthorized for inventory deduction.`);
                    return null;
                }
            }
        }

        // 2. GUARD: Rate Limit (Max 10 feeds/day/tank)
        // Prevents abuse/spam from bad clients
        const todayQuery = db.collection('feedEntries')
            .where('tankId', '==', tankId)
            .where('date', '==', date);
        const todaySnap = await todayQuery.get();

        if (todaySnap.size > 10) {
            console.warn(`Abuse detected: Tank ${tankId} has ${todaySnap.size} entries. Deleting spam.`);
            await snap.ref.delete();
            return null;
        }

        // 2. GUARD: Inventory Protection & Management (Ticket 3)
        // Move inventory logic to server-side to enforce RBAC.
        const invRef = db.collection('inventory').doc(farmId);
        const invDoc = await invRef.get();
        const currentTotal = (invDoc.exists ? invDoc.data().totalKg : 0) || 0;

        if (currentTotal - amount < 0) {
            console.warn(`Inventory insufficient (${currentTotal}kg < ${amount}kg). Rejecting feed entry ${snap.id}`);
            await snap.ref.delete();
            return null;
        }

        // TICKET 1: Ensure ownerId exists (Backfill if missing)
        if (!entry.ownerId) {
            await snap.ref.update({ ownerId: farmData.ownerId });
        }

        await invRef.update({
            totalKg: admin.firestore.FieldValue.increment(-amount)
        });

        // 4. INTELLIGENCE: Disease Risk Analysis
        const feedQuery = db.collection('feedEntries')
            .where('tankId', '==', tankId)
            .orderBy('id', 'desc')
            .limit(3);
        const feedSnap = await feedQuery.get();

        if (feedSnap.size >= 3) {
            const last3Feeds = feedSnap.docs.map(d => d.data());
            if (last3Feeds.every(f => f.trayResult === 'too-much')) {
                const tank = (await db.collection('tanks').doc(tankId).get()).data();
                await createAlertAndNotify({
                    farmId, tankId, type: 'disease_risk', level: 'critical',
                    message: `Disease Risk: 3 consecutive feeds with leftovers in ${tank.name}. Check health immediately.`
                });
            }
        }
        return null;
    });

/**
 * FACT 2 FIX: Handle Inventory Refund on Feed Deletion
 */
exports.onFeedEntryDelete = functions.firestore
    .document('feedEntries/{entryId}')
    .onDelete(async (snap, context) => {
        const entry = snap.data();
        const { farmId, amount } = entry;

        const invRef = db.collection('inventory').doc(farmId);
        await invRef.update({
            totalKg: admin.firestore.FieldValue.increment(amount) // Add back the amount
        });
        return null;
    });

/**
 * FACT 2 FIX: Handle Inventory Adjustment on Feed Update
 */
exports.onFeedEntryUpdate = functions.firestore
    .document('feedEntries/{entryId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const diff = after.amount - before.amount;

        if (diff !== 0) {
            const invRef = db.collection('inventory').doc(after.farmId);
            await invRef.update({
                totalKg: admin.firestore.FieldValue.increment(-diff) // Subtract the difference
            });
        }
        return null;
    });

/**
 * Triggered when a new water test is created.
 * Checks for crash risk (rising ammonia + increasing feed).
 */
exports.onWaterEntryCreate = functions.firestore
    .document('waterEntries/{entryId}')
    .onCreate(async (snap) => {
        const data = snap.data();
        const { tankId, farmId } = data;

        // TICKET 1: Ensure ownerId exists (Backfill if missing)
        if (!data.ownerId) {
            const farmDoc = await db.collection('farms').doc(farmId).get();
            if (farmDoc.exists) {
                await snap.ref.update({ ownerId: farmDoc.data().ownerId });
            }
        }

        // GAP 3: Smart Feed Adjustment
        // If Ammonia is high (> 1.0), suggest 10% feed reduction.
        const currentAmm = data.amm || 0;
        const tankRef = db.collection("tanks").doc(tankId);

        try {
            if (currentAmm > 1.0) {
                await tankRef.update({
                    feedAdjustmentPct: -10,
                    feedAdjustmentReason: "High Ammonia",
                });
            } else {
                await tankRef.update({
                    feedAdjustmentPct: admin.firestore.FieldValue.delete(),
                    feedAdjustmentReason: admin.firestore.FieldValue.delete(),
                });
            }
        } catch (error) {
            console.error(`Failed to update tank ${tankId} feed adjustment:`, error);
        }

        const waterQuery = db.collection('waterEntries').where('tankId', '==', tankId).orderBy('date', 'desc').limit(2);
        const waterSnap = await waterQuery.get();

        if (waterSnap.size >= 2) {
            const [current, prev] = waterSnap.docs.map(d => d.data());
            if ((current.amm || 0) > (prev.amm || 0)) {
                const todayStr = new Date().toISOString().split('T')[0];
                const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                const feedToday = (await db.collection('feedEntries').where('tankId', '==', tankId).where('date', '==', todayStr).get()).docs.reduce((s, d) => s + d.data().amount, 0);
                const feedYesterday = (await db.collection('feedEntries').where('tankId', '==', tankId).where('date', '==', yesterdayStr).get()).docs.reduce((s, d) => s + d.data().amount, 0);

                if (feedToday > feedYesterday) {
                    const tank = (await db.collection('tanks').doc(tankId).get()).data();
                    await createAlertAndNotify({
                        farmId, tankId, type: 'crash_risk', level: 'critical',
                        message: `Crash Risk: Ammonia is rising while feed increased in ${tank.name}. Reduce feed.`
                    });
                }
            }
        }
        return null;
    });

/**
 * Triggered when a Technician adds an advisory note (Ticket 5).
 * Notifies the Farm Owner without affecting operations.
 */
exports.onAdvisoryNoteCreate = functions.firestore
    .document('advisoryNotes/{noteId}')
    .onCreate(async (snap) => {
        const note = snap.data();
        const { farmId, message, tankId } = note;

        // 1. Get the farm owner's ID
        const farmDoc = await db.collection('farms').doc(farmId).get();
        if (!farmDoc.exists) {
            console.error(`Farm ${farmId} not found for advisory note.`);
            return null;
        }
        const ownerId = farmDoc.data().ownerId;

        // 2. Get owner's FCM tokens
        const tokensSnap = await db.collection('users').doc(ownerId).collection('fcmTokens').get();
        if (tokensSnap.empty) {
            console.log(`No FCM tokens found for owner ${ownerId}.`);
            return null;
        }
        const tokens = tokensSnap.docs.map(doc => doc.data().token);

        // 3. Send Push Notification
        const messagePayload = {
            tokens: tokens,
            notification: {
                title: 'New Technician Advice',
                body: message,
            },
            data: {
                screen: 'advisory',
                noteId: snap.id,
                tankId: tankId || ''
            }
        };

        const response = await admin.messaging().sendEachForMulticast(messagePayload);
        console.log(`Sent advisory notification to ${response.successCount} devices.`);

        // 4. Token Cleanup
        const tokensToRemove = [];
        response.responses.forEach((result, index) => {
            const error = result.error;
            if (error) {
                if (error.code === 'messaging/invalid-registration-token' ||
                    error.code === 'messaging/registration-token-not-registered') {
                    tokensToRemove.push(tokensSnap.docs[index].ref.delete());
                }
            }
        });
        return Promise.all(tokensToRemove);
    });