import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { getStatementProcessor } from "./processors/factory";
import { detectBankMetadata } from "./bank-detector";
import { extractTransactionsFromText } from "./transaction-extractor";
import { normalizeRawTransaction } from "./normalizer";
import { enrichTransactionsWithAI } from "./ai-classifier";
import { detectDuplicates } from "./duplicate-detector";

export async function processStatementJob(uploadId: string, userId: string): Promise<void> {
  async function updateJob(
    step: string,
    stepIndex: number,
    progress: number,
    status: "queued" | "processing" | "completed" | "failed" = "processing",
    errorDetails?: string
  ) {
    await db.query(
      `UPDATE statement_processing_jobs 
       SET current_step = ?, step_index = ?, progress_percent = ?, status = ?, error_details = ?, updated_at = NOW(3)
       WHERE upload_id = ? AND user_id = ?`,
      [step, stepIndex, progress, status, errorDetails ?? null, uploadId, userId]
    );
  }

  try {
    // 1. Fetch upload record
    const [uploadRows] = await db.query(
      "SELECT id, stored_name AS storedName, mime_type AS mimeType FROM statement_uploads WHERE id = ? AND user_id = ? LIMIT 1",
      [uploadId, userId]
    );
    const upload = Array.isArray(uploadRows) && uploadRows.length > 0 ? (uploadRows[0] as { storedName: string; mimeType: string }) : null;
    if (!upload) throw new Error("Statement upload record not found.");

    await db.query("UPDATE statement_uploads SET status = 'processing' WHERE id = ?", [uploadId]);
    await updateJob("Reading statement document", 1, 15);

    // 2. Read physical file & extract text
    const filePath = join(process.cwd(), ".data", "statements", userId, upload.storedName);
    const buffer = await readFile(filePath);
    const processor = getStatementProcessor(upload.mimeType);
    if (upload.mimeType === "image/png" || upload.mimeType === "image/jpeg") {
      await updateJob("Reading screenshot with OCR", 1, 20);
    }
    const extraction = processor.extractText(buffer);
    const extractionTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Screenshot OCR timed out. Please upload a tighter crop of the transaction table.")), 90_000);
    });
    const { text } = await Promise.race([extraction, extractionTimeout]);

    if (!text || text.trim().length === 0) {
      throw new Error("No readable text found in statement. Please ensure document is clear and readable.");
    }

    // 3. Detect bank metadata
    await updateJob("Detecting bank and account details", 2, 30);
    const metadata = detectBankMetadata(text);
    await db.query(
      `UPDATE statement_uploads 
       SET bank_name = ?, account_number = ?, account_holder = ?, period_start = ?, period_end = ?, closing_balance = ?, updated_at = NOW(3)
       WHERE id = ?`,
      [
        metadata.bankName,
        metadata.accountNumber,
        metadata.accountHolder,
        metadata.periodStart,
        metadata.periodEnd,
        metadata.closingBalance,
        uploadId,
      ]
    );

    // 4. Extract raw transactions
    await updateJob("Extracting transaction rows", 3, 45);
    const rawTxs = extractTransactionsFromText(text);

    if (rawTxs.length === 0) {
      throw new Error(
        "Could not detect any transaction rows in this statement. Please verify this is a valid bank statement containing transaction history."
      );
    }

    await db.query("UPDATE statement_uploads SET extracted_count = ? WHERE id = ?", [rawTxs.length, uploadId]);

    // 5. Normalize transactions
    await updateJob("Normalizing merchants and formats", 4, 60);
    let normalized = rawTxs.map(normalizeRawTransaction);

    // 6. Enrich with AI classification
    await updateJob("Categorizing with AI intelligence", 5, 75);
    normalized = await enrichTransactionsWithAI(normalized);

    // 7. Check for duplicate transactions
    await updateJob("Detecting duplicate transactions", 6, 90);
    const { transactions: deduplicated } = await detectDuplicates(userId, normalized);

    // 8. Persist to extracted_transactions table
    await db.query("DELETE FROM extracted_transactions WHERE upload_id = ?", [uploadId]);

    for (const tx of deduplicated) {
      const txId = randomUUID();
      await db.query(
        `INSERT INTO extracted_transactions (
          id, upload_id, user_id, occurred_at, description, merchant, reference, amount, type, category, confidence, balance, duplicate_status, selected, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          txId,
          uploadId,
          userId,
          tx.occurredAt,
          tx.description.slice(0, 255),
          tx.merchant ? tx.merchant.slice(0, 120) : null,
          tx.reference ? tx.reference.slice(0, 120) : null,
          tx.amount,
          tx.type,
          tx.category,
          tx.confidence,
          tx.balance ?? null,
          tx.duplicateStatus,
          tx.selected ? 1 : 0,
        ]
      );
    }

    // Mark completed and ready for review
    await db.query("UPDATE statement_uploads SET status = 'review', updated_at = NOW(3) WHERE id = ?", [uploadId]);
    await updateJob("Ready for your verification", 7, 100, "completed");
  } catch (error: any) {
    const errorMsg = error?.message ?? "Failed to process bank statement.";
    console.error("Statement processing job failed:", error);
    await db.query(
      "UPDATE statement_uploads SET status = 'failed', error_message = ?, updated_at = NOW(3) WHERE id = ?",
      [errorMsg.slice(0, 490), uploadId]
    );
    await updateJob("Processing failed", 1, 0, "failed", errorMsg);
  }
}
