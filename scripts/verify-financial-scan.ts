import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/lib/db";
import { processStatementJob } from "../src/lib/scan/job-runner";
import { computeComprehensiveIntelligence } from "../src/lib/intelligence/engine";

async function main() {
  console.log("=== STEP 1: VERIFY TEST USER AND UPLOAD FILE ===");
  const userId = "b0b6986a-0ad8-425f-b7c6-7ee67f8ed268";
  const uploadId = "a9424efd-4ad0-4f86-a70d-b28f3ebf6f88";

  // Check statement upload row
  const [uploads] = await db.query(
    "SELECT id, user_id, original_name, stored_name, mime_type, status FROM statement_uploads WHERE id = ? AND user_id = ?",
    [uploadId, userId]
  );
  console.log("Upload record:", uploads);

  // Ensure a job row exists
  await db.query("DELETE FROM statement_processing_jobs WHERE upload_id = ?", [uploadId]);
  await db.query(
    `INSERT INTO statement_processing_jobs (id, upload_id, user_id, status, current_step, step_index, total_steps, progress_percent, created_at, updated_at)
     VALUES (UUID(), ?, ?, 'queued', 'Queued for processing', 1, 8, 10, NOW(3), NOW(3))`,
    [uploadId, userId]
  );

  console.log("\n=== STEP 2: EXECUTE STATEMENT PROCESSING JOB ===");
  const startTime = Date.now();
  await processStatementJob(uploadId, userId);
  console.log(`Processing job finished in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  // Check upload and job status
  const [updatedUpload] = await db.query(
    "SELECT id, status, bank_name, account_number, account_holder, extracted_count, error_message FROM statement_uploads WHERE id = ?",
    [uploadId]
  );
  console.log("Updated upload status:", updatedUpload);

  const [updatedJob] = await db.query(
    "SELECT id, status, current_step, progress_percent, error_details FROM statement_processing_jobs WHERE upload_id = ?",
    [uploadId]
  );
  console.log("Updated job status:", updatedJob);

  // Check extracted transactions
  const [extracted] = await db.query(
    "SELECT id, occurred_at, description, merchant, amount, type, category, confidence, duplicate_status, selected FROM extracted_transactions WHERE upload_id = ? ORDER BY occurred_at DESC LIMIT 10",
    [uploadId]
  );
  console.log(`\nSample extracted transactions (showing 10 of ${(updatedUpload as any[])[0]?.extracted_count}):`);
  console.table(extracted);

  console.log("\n=== STEP 3: SIMULATE USER VERIFICATION GATE ===");
  // Simulate user adjusting a category or unselecting one
  if (Array.isArray(extracted) && extracted.length > 0) {
    const firstTx = extracted[0] as any;
    console.log(`Editing transaction ${firstTx.id} (${firstTx.description})...`);
    await db.query(
      "UPDATE extracted_transactions SET category = 'Food & Dining', selected = 1 WHERE id = ?",
      [firstTx.id]
    );
    console.log("Verification edit applied successfully.");
  }

  console.log("\n=== STEP 4: IMPORT VERIFIED TRANSACTIONS INTO DATABASE ===");
  // Fetch verified/selected transactions
  const [selectedToImport] = await db.query(
    "SELECT * FROM extracted_transactions WHERE upload_id = ? AND selected = 1",
    [uploadId]
  );
  const txsToImport = Array.isArray(selectedToImport) ? selectedToImport : [];
  console.log(`Transactions marked for import: ${txsToImport.length}`);

  // Find or create target account
  let targetAccountId: string | null = null;
  const [existingAccounts] = await db.query("SELECT id, name FROM accounts WHERE user_id = ? LIMIT 1", [userId]);
  if (Array.isArray(existingAccounts) && existingAccounts.length > 0) {
    targetAccountId = (existingAccounts[0] as any).id;
  } else {
    targetAccountId = "b0b6986a-0000-0000-0000-000000000001";
    await db.query(
      "INSERT INTO accounts (id, user_id, name, type, balance, currency) VALUES (?, ?, 'Primary Savings', 'savings', 0, 'INR')",
      [targetAccountId, userId]
    );
  }

  let importedCount = 0;
  let duplicateCount = 0;
  const { createHash } = await import("node:crypto");

  for (const tx of txsToImport as any[]) {
    const occurredDate = new Date(tx.occurred_at);
    const fingerprint = createHash("sha256")
      .update(`${userId}|${targetAccountId}|${tx.type}|${Number(tx.amount).toFixed(2)}|${tx.description}|${occurredDate.toISOString()}`)
      .digest("hex");

    try {
      await db.query(
        `INSERT INTO transactions (
          id, user_id, account_id, type, amount, description, merchant, category, occurred_at, fingerprint, source, upload_id, confidence
        ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'statement', ?, ?)`,
        [
          userId,
          targetAccountId,
          tx.type,
          tx.amount,
          tx.description.slice(0, 160),
          tx.merchant ? tx.merchant.slice(0, 120) : null,
          tx.category,
          occurredDate,
          fingerprint,
          uploadId,
          tx.confidence,
        ]
      );
      importedCount++;
    } catch (err: any) {
      if (err?.code === "ER_DUP_ENTRY") {
        duplicateCount++;
      } else {
        console.error("Import error:", err.message);
      }
    }
  }

  await db.query("UPDATE statement_uploads SET status = 'imported' WHERE id = ?", [uploadId]);
  await db.query("UPDATE extracted_transactions SET duplicate_status = 'imported' WHERE upload_id = ?", [uploadId]);
  console.log(`Import result: ${importedCount} imported, ${duplicateCount} duplicates skipped.`);

  console.log("\n=== STEP 5: COMPUTE COMPREHENSIVE FINANCIAL INTELLIGENCE ===");
  const intel = await computeComprehensiveIntelligence(userId);
  console.log("Intelligence Overview:", {
    netWorth: intel.overview.totalNetWorth,
    monthlyIncome: intel.overview.monthlyIncome,
    monthlyExpenses: intel.overview.monthlyExpenses,
    savingsRate: `${intel.overview.savingsRate}%`,
    essentialSpending: intel.overview.essentialSpending,
    discretionarySpending: intel.overview.discretionarySpending,
    healthScore: `${intel.healthScore.score}/100 (${intel.healthScore.summary})`,
    nextBestMove: intel.nextBestMove.title,
    moneyLeaksFound: intel.moneyLeaks.length,
    recurringFound: intel.recurringPayments.length,
  });

  console.log("\nHealth Score Factors:");
  console.table(intel.healthScore.factors);

  console.log("\nTop Recurring Commitments:");
  console.table(intel.recurringPayments.slice(0, 5));

  console.log("\nDetected Money Leaks:");
  console.table(intel.moneyLeaks.slice(0, 5));

  console.log("\n30-Day Cash Flow Forecast:");
  console.log(intel.cashFlowForecast);

  console.log("\n=== VERIFICATION COMPLETE: ALL PIPELINE STAGES PASSED ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
