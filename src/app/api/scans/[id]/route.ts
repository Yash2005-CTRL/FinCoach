import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const { id: uploadId } = await context.params;
  if (!uploadId) return NextResponse.json({ error: "Upload ID required" }, { status: 400 });

  // Recover jobs left behind by a crashed or interrupted OCR worker.
  await db.query(
    `UPDATE statement_uploads u
     INNER JOIN statement_processing_jobs j ON j.upload_id = u.id
     SET u.status = 'failed',
         u.error_message = 'Scan timed out before OCR completed. Please upload a tighter crop of the transaction table.',
         u.updated_at = NOW(3),
         j.status = 'failed',
         j.current_step = 'Processing timed out',
         j.progress_percent = 0,
         j.error_details = 'The OCR worker did not finish within the allowed processing window.',
         j.updated_at = NOW(3)
     WHERE u.id = ? AND u.user_id = ?
       AND u.status IN ('uploaded', 'processing')
       AND j.status IN ('queued', 'processing')
       AND j.updated_at < DATE_SUB(NOW(3), INTERVAL 3 MINUTE)`,
    [uploadId, userId]
  );

  const [uploadRows] = await db.query(
    `SELECT 
      u.id, 
      u.original_name AS originalName, 
      u.size_bytes AS sizeBytes, 
      u.mime_type AS mimeType,
      u.status, 
      u.bank_name AS bankName, 
      u.account_number AS accountNumber, 
      u.account_holder AS accountHolder, 
      u.period_start AS periodStart, 
      u.period_end AS periodEnd, 
      u.closing_balance AS closingBalance, 
      u.extracted_count AS extractedCount, 
      u.error_message AS errorMessage, 
      u.created_at AS createdAt,
      j.current_step AS currentStep,
      j.step_index AS stepIndex,
      j.total_steps AS totalSteps,
      j.progress_percent AS progressPercent,
      j.status AS jobStatus,
      j.error_details AS errorDetails
    FROM statement_uploads u
    LEFT JOIN statement_processing_jobs j ON j.upload_id = u.id
    WHERE u.id = ? AND u.user_id = ?
    LIMIT 1`,
    [uploadId, userId]
  );

  const upload = Array.isArray(uploadRows) && uploadRows.length > 0 ? uploadRows[0] : null;
  if (!upload) return NextResponse.json({ error: "Statement scan not found" }, { status: 404 });

  const [txRows] = await db.query(
    `SELECT 
      id, 
      occurred_at AS occurredAt, 
      description, 
      merchant, 
      reference, 
      amount, 
      type, 
      category, 
      confidence, 
      balance, 
      duplicate_status AS duplicateStatus, 
      selected 
    FROM extracted_transactions 
    WHERE upload_id = ? AND user_id = ? 
    ORDER BY occurred_at ASC, id ASC`,
    [uploadId, userId]
  );

  return NextResponse.json({ upload, transactions: txRows });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const { id: uploadId } = await context.params;
  if (!uploadId) return NextResponse.json({ error: "Upload ID required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const txList = Array.isArray(body.transactions) ? body.transactions : [];

  for (const tx of txList) {
    if (!tx.id) continue;
    await db.query(
      `UPDATE extracted_transactions 
       SET description = ?, category = ?, type = ?, amount = ?, confidence = ?, selected = ?
       WHERE id = ? AND upload_id = ? AND user_id = ?`,
      [
        String(tx.description || "Transaction").slice(0, 255),
        String(tx.category || "Other Expense").slice(0, 80),
        ["income", "expense", "transfer"].includes(tx.type) ? tx.type : "expense",
        Number(tx.amount || 0),
        Math.min(100, Math.max(0, Number(tx.confidence || 50))),
        tx.selected ? 1 : 0,
        tx.id,
        uploadId,
        userId,
      ]
    );
  }

  return NextResponse.json({ ok: true, updatedCount: txList.length });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const { id: uploadId } = await context.params;
  if (!uploadId) return NextResponse.json({ error: "Upload ID required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const createAccount = Boolean(body.createAccount);
  let targetAccountId = typeof body.accountId === "string" ? body.accountId : null;

  // 1. Fetch statement upload
  const [uploadRows] = await db.query(
    "SELECT id, bank_name AS bankName, account_number AS accountNumber, closing_balance AS closingBalance FROM statement_uploads WHERE id = ? AND user_id = ? LIMIT 1",
    [uploadId, userId]
  );
  const upload = Array.isArray(uploadRows) && uploadRows.length > 0 ? (uploadRows[0] as any) : null;
  if (!upload) return NextResponse.json({ error: "Statement upload not found" }, { status: 404 });

  // 2. Resolve or create account
  if (targetAccountId) {
    const [accRows] = await db.query("SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1", [targetAccountId, userId]);
    if (!Array.isArray(accRows) || accRows.length === 0) targetAccountId = null;
  }

  if (!targetAccountId && upload.accountNumber) {
    const [matchingAcc] = await db.query(
      "SELECT id FROM accounts WHERE user_id = ? AND account_number = ? LIMIT 1",
      [userId, upload.accountNumber]
    );
    if (Array.isArray(matchingAcc) && matchingAcc.length > 0) {
      targetAccountId = (matchingAcc[0] as any).id;
    }
  }

  if (!targetAccountId && (createAccount || upload.accountNumber)) {
    const newAccId = randomUUID();
    const accName = upload.bankName ? `${upload.bankName} Account` : "Imported Bank Account";
    try {
      await db.query(
        `INSERT INTO accounts (id, user_id, name, account_number, type, institution, balance, currency)
         VALUES (?, ?, ?, ?, 'savings', ?, ?, 'INR')`,
        [
          newAccId,
          userId,
          accName,
          upload.accountNumber ?? null,
          upload.bankName ?? null,
          upload.closingBalance ? Number(upload.closingBalance) : 0,
        ]
      );
      targetAccountId = newAccId;
    } catch {
      // If account number collision, fallback to primary account
    }
  }

  if (!targetAccountId) {
    const [firstAcc] = await db.query("SELECT id FROM accounts WHERE user_id = ? ORDER BY created_at ASC LIMIT 1", [userId]);
    if (Array.isArray(firstAcc) && firstAcc.length > 0) {
      targetAccountId = (firstAcc[0] as any).id;
    } else {
      // Create a default primary account
      const fallbackId = randomUUID();
      await db.query(
        "INSERT INTO accounts (id, user_id, name, type, balance, currency) VALUES (?, ?, 'Primary Savings', 'savings', 0, 'INR')",
        [fallbackId, userId]
      );
      targetAccountId = fallbackId;
    }
  }

  // 3. Fetch selected extracted transactions
  const [selectedTxRows] = await db.query(
    `SELECT id, occurred_at AS occurredAt, description, merchant, amount, type, category, confidence 
     FROM extracted_transactions 
     WHERE upload_id = ? AND user_id = ? AND selected = 1`,
    [uploadId, userId]
  );

  const selectedTxs = Array.isArray(selectedTxRows) ? selectedTxRows : [];
  if (selectedTxs.length === 0) {
    return NextResponse.json({ error: "No transactions selected for import." }, { status: 400 });
  }

  const connection = await db.getConnection();
  let importedCount = 0;
  let skippedDuplicates = 0;

  try {
    await connection.beginTransaction();

    for (const tx of selectedTxs as any[]) {
      const occurredDate = new Date(tx.occurredAt);
      const { createHash } = await import("node:crypto");
      const fingerprint = createHash("sha256")
        .update(`${userId}|${targetAccountId}|${tx.type}|${Number(tx.amount).toFixed(2)}|${tx.description}|${occurredDate.toISOString()}`)
        .digest("hex");

      try {
        const txId = randomUUID();
        await connection.query(
          `INSERT INTO transactions (
            id, user_id, account_id, type, amount, description, merchant, category, occurred_at, fingerprint, source, upload_id, confidence
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'statement', ?, ?)`,
          [
            txId,
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

        if (tx.type === "income" || tx.type === "expense") {
          const delta = tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
          await connection.query("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?", [
            delta,
            targetAccountId,
            userId,
          ]);
        }
        importedCount++;
      } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY") {
          skippedDuplicates++;
        } else {
          console.error("Import error for transaction:", err);
        }
      }
    }

    // Update statement upload status
    await connection.query("UPDATE statement_uploads SET status = 'imported', updated_at = NOW(3) WHERE id = ?", [uploadId]);
    await connection.query("UPDATE extracted_transactions SET duplicate_status = 'imported' WHERE upload_id = ?", [uploadId]);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Batch transaction import failed:", error);
    return NextResponse.json({ error: "Failed to import transactions." }, { status: 500 });
  } finally {
    connection.release();
  }

  return NextResponse.json({
    ok: true,
    imported: importedCount,
    skippedDuplicates,
    accountId: targetAccountId,
    message: `${importedCount} verified transactions imported successfully into your accounts.`,
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const { id: uploadId } = await context.params;
  if (!uploadId) return NextResponse.json({ error: "Upload ID required" }, { status: 400 });

  const [uploadRows] = await db.query(
    "SELECT stored_name AS storedName FROM statement_uploads WHERE id = ? AND user_id = ? LIMIT 1",
    [uploadId, userId]
  );

  const upload = Array.isArray(uploadRows) && uploadRows.length > 0 ? (uploadRows[0] as { storedName: string }) : null;
  if (!upload) return NextResponse.json({ error: "Statement upload not found" }, { status: 404 });

  // Delete physical file safely
  try {
    const filePath = join(process.cwd(), ".data", "statements", userId, upload.storedName);
    await unlink(filePath).catch(() => undefined);
  } catch {}

  // Delete upload record (cascades to extracted_transactions and jobs)
  await db.query("DELETE FROM statement_uploads WHERE id = ? AND user_id = ?", [uploadId, userId]);

  return NextResponse.json({ ok: true, message: "Statement deleted successfully" });
}

