/**
 * FULL DATABASE CLEANUP SCRIPT
 *
 * This script will DELETE all data EXCEPT users and staffInviteCodes
 *
 * WHAT WILL BE DELETED:
 * - All Firestore collections (except users & staffInviteCodes)
 * - All counter documents
 * - All Firebase Storage files (images, PDFs, etc.)
 *
 * WHAT WILL BE KEPT:
 * - users collection
 * - staffInviteCodes collection
 *
 * ⚠️  WARNING: THIS CANNOT BE UNDONE! ⚠️
 *
 * Run with: npm run cleanup:database
 */

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load service account key
let serviceAccount;
try {
  const serviceAccountPath = join(__dirname, "service-account-key.json");
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
} catch (error) {
  console.error("❌ Error: Could not load service-account-key.json");
  console.error("Please follow the setup instructions in cleanup-activities-admin.js");
  process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: serviceAccount.project_id + ".appspot.com",
});

const db = admin.firestore();
const storage = admin.storage().bucket();

// Collections to delete
const COLLECTIONS_TO_DELETE = [
  "activities",
  "assetDamageReports",
  "auditLogs",
  "cctvCheckForms",
  "incidentReports",
  "clientOTPs",
];

// Counter documents to delete
const COUNTER_DOCS_TO_DELETE = [
  "incidentReports",
  "assetDamage",
  "cctvCheck",
];

// Storage folders to delete
const STORAGE_FOLDERS_TO_DELETE = [
  "asset-damage/",
  "incident-reports/",
];

/**
 * Prompt user for confirmation
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Delete all documents in a collection
 */
async function deleteCollection(collectionName, batchSize = 500) {
  console.log(`\n🗑️  Deleting '${collectionName}' collection...`);

  const collectionRef = db.collection(collectionName);
  const query = collectionRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject, 0);
  });
}

async function deleteQueryBatch(db, query, resolve, reject, deletedCount) {
  try {
    const snapshot = await query.get();

    if (snapshot.size === 0) {
      console.log(`   ✅ Deleted ${deletedCount} documents`);
      resolve();
      return;
    }

    // Delete documents in a batch
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    const newDeletedCount = deletedCount + snapshot.size;
    if (newDeletedCount % 100 === 0) {
      console.log(`   Progress: ${newDeletedCount} documents...`);
    }

    // Recurse on the next process tick
    process.nextTick(() => {
      deleteQueryBatch(db, query, resolve, reject, newDeletedCount);
    });
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    reject(error);
  }
}

/**
 * Delete specific counter documents
 */
async function deleteCounters() {
  console.log(`\n🗑️  Deleting counter documents...`);

  let deletedCount = 0;
  for (const counterName of COUNTER_DOCS_TO_DELETE) {
    try {
      const counterRef = db.collection("counters").doc(counterName);
      const doc = await counterRef.get();

      if (doc.exists) {
        await counterRef.delete();
        deletedCount++;
        console.log(`   ✅ Deleted counter: ${counterName}`);
      } else {
        console.log(`   ⚠️  Counter not found: ${counterName}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to delete counter ${counterName}:`, error.message);
    }
  }

  console.log(`   ✅ Deleted ${deletedCount} counter documents`);
}

/**
 * Delete all files in a storage folder
 */
async function deleteStorageFolder(folderPath) {
  console.log(`\n🗑️  Deleting storage folder: ${folderPath}`);

  try {
    const [files] = await storage.getFiles({ prefix: folderPath });

    if (files.length === 0) {
      console.log(`   ⚠️  Folder is empty or doesn't exist`);
      return;
    }

    console.log(`   Found ${files.length} files to delete...`);

    // Delete files in batches
    const batchSize = 100;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map((file) => file.delete()));
      console.log(`   Progress: ${Math.min(i + batchSize, files.length)}/${files.length} files...`);
    }

    console.log(`   ✅ Deleted ${files.length} files`);
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("==========================================");
  console.log("🧹 FULL DATABASE CLEANUP SCRIPT");
  console.log("==========================================");
  console.log("");
  console.log("⚠️  WARNING: This will DELETE all data except:");
  console.log("   - users collection");
  console.log("   - staffInviteCodes collection");
  console.log("");
  console.log("📋 What will be deleted:");
  console.log("   Collections:", COLLECTIONS_TO_DELETE.join(", "));
  console.log("   Counters:", COUNTER_DOCS_TO_DELETE.join(", "));
  console.log("   Storage folders:", STORAGE_FOLDERS_TO_DELETE.join(", "));
  console.log("");
  console.log("⚠️  THIS CANNOT BE UNDONE!");
  console.log("");

  // Ask for confirmation
  const confirmed = await askConfirmation(
    "Type 'yes' to proceed with cleanup: "
  );

  if (!confirmed) {
    console.log("\n❌ Cleanup cancelled by user.");
    process.exit(0);
  }

  console.log("\n🚀 Starting cleanup...\n");

  try {
    // Step 1: Delete Firestore collections
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 1: Deleting Firestore Collections");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    for (const collectionName of COLLECTIONS_TO_DELETE) {
      await deleteCollection(collectionName);
    }

    // Step 2: Delete counter documents
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 2: Deleting Counter Documents");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    await deleteCounters();

    // Step 3: Delete storage files
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 3: Deleting Storage Files");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    for (const folderPath of STORAGE_FOLDERS_TO_DELETE) {
      await deleteStorageFolder(folderPath);
    }

    // Summary
    console.log("\n==========================================");
    console.log("✅ CLEANUP COMPLETED SUCCESSFULLY!");
    console.log("==========================================");
    console.log("");
    console.log("✨ Your database has been reset!");
    console.log("📝 Preserved: users, staffInviteCodes");
    console.log("🔢 Next form numbers will start from 01");
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("\n==========================================");
    console.error("❌ CLEANUP FAILED!");
    console.error("==========================================");
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
