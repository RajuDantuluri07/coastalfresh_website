const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { validateFarmData, validateTankData, validateFeedRoundData } = require("./validation");

admin.initializeApp();
const db = admin.firestore();

exports.createFarm = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in to create a farm.");
  }

  const validationError = validateFarmData(data);
  if (validationError) {
    throw new functions.https.HttpsError("invalid-argument", validationError);
  }

  const farm = {
    name: data.name,
    owner: context.auth.uid,
  };

  const farmRef = await db.collection("farms").add(farm);
  return { id: farmRef.id };
});

exports.createTank = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in to create a tank.");
  }

  const validationError = validateTankData(data);
  if (validationError) {
    throw new functions.https.HttpsError("invalid-argument", validationError);
  }

  const farmRef = db.collection("farms").doc(data.farmId);
  const farmDoc = await farmRef.get();
  if (!farmDoc.exists || farmDoc.data().owner !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "You do not have permission to create a tank in this farm.");
  }

  const tank = {
    name: data.name,
    farmId: data.farmId,
  };

  const tankRef = await db.collection("tanks").add(tank);
  return { id: tankRef.id };
});

exports.createFeedRound = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in to create a feed round.");
  }

  const validationError = validateFeedRoundData(data);
  if (validationError) {
    throw new functions.https.HttpsError("invalid-argument", validationError);
  }

  const tankRef = db.collection("tanks").doc(data.tankId);
  const tankDoc = await tankRef.get();
  if (!tankDoc.exists) {
    throw new functions.https.HttpsError("not-found", "The specified tank does not exist.");
  }

  const farmRef = db.collection("farms").doc(tankDoc.data().farmId);
  const farmDoc = await farmRef.get();
  if (farmDoc.data().owner !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "You do not have permission to create a feed round in this tank.");
  }

  const feedRound = {
    tankId: data.tankId,
    feedAmount: data.feedAmount,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };

  const feedRoundRef = await db.collection("feedEntries").add(feedRound);
  return { id: feedRoundRef.id };
});

exports.deleteFarm = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be logged in to delete a farm.");
  }

  const farmRef = db.collection("farms").doc(data.farmId);
  const farmDoc = await farmRef.get();
  if (!farmDoc.exists || farmDoc.data().owner !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "You do not have permission to delete this farm.");
  }

  // Fix: Handle batch limits (max 500 ops) by committing in chunks
  let batch = db.batch();
  let count = 0;
  const MAX_BATCH_SIZE = 400;

  const tanksSnapshot = await db.collection("tanks").where("farmId", "==", data.farmId).get();
  
  for (const tankDoc of tanksSnapshot.docs) {
    const feedEntriesSnapshot = await db.collection("feedEntries").where("tankId", "==", tankDoc.id).get();
    for (const feedRoundDoc of feedEntriesSnapshot.docs) {
      batch.delete(feedRoundDoc.ref);
      count++;
      if (count >= MAX_BATCH_SIZE) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    batch.delete(tankDoc.ref);
    count++;
    if (count >= MAX_BATCH_SIZE) { await batch.commit(); batch = db.batch(); count = 0; }
  }

  batch.delete(farmRef);
  if (count > 0 || tanksSnapshot.size === 0) await batch.commit();
  
  return { success: true };
});
