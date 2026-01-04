#!/usr/bin/env node

/**
 * MIGRATION SCRIPT: Move memberIds to members subcollection
 * 
 * Usage: 
 * 1. export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 * 2. node scripts/migrate_members.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
// Uses GOOGLE_APPLICATION_CREDENTIALS or default environment config
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

async function migrateMembers() {
  console.log('🚀 Starting migration: memberIds -> members subcollection...');
  
  const farmsSnapshot = await db.collection('farms').get();
  const BATCH_LIMIT = 400; // Firestore batch limit is 500, keeping a safety buffer
  let batch = db.batch();
  let opCount = 0;
  let totalMoved = 0;

  for (const farmDoc of farmsSnapshot.docs) {
    const data = farmDoc.data();
    const memberIds = data.memberIds;

    // Only process if memberIds exists and has items
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      console.log(`Processing Farm ${farmDoc.id}: Moving ${memberIds.length} members.`);

      for (const uid of memberIds) {
        // 1. Create new document in 'members' subcollection
        // Defaulting role to 'worker' as legacy members were likely workers
        const memberRef = farmDoc.ref.collection('members').doc(uid);
        batch.set(memberRef, {
          role: 'worker', 
          migratedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        opCount++;
      }

      // 2. Delete the old memberIds array to complete the "move"
      batch.update(farmDoc.ref, {
        memberIds: admin.firestore.FieldValue.delete()
      });
      opCount++;
      totalMoved += memberIds.length;

      // Commit if we reach the batch limit
      if (opCount >= BATCH_LIMIT) {
        await batch.commit();
        console.log(`💾 Committed batch of ${opCount} operations.`);
        batch = db.batch();
        opCount = 0;
      }
    }
  }

  // Commit any remaining operations
  if (opCount > 0) {
    await batch.commit();
    console.log(`💾 Committed final batch of ${opCount} operations.`);
  }

  console.log(`✅ Migration Complete. Successfully moved ${totalMoved} members.`);
}

migrateMembers().catch(err => {
  console.error('❌ Migration failed:', err);
});