import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { NormalizedTransaction } from "./types";

export function generateFingerprint(
  userId: string,
  accountId: string | null,
  type: string,
  amount: number,
  description: string,
  occurredAt: Date
): string {
  const dateStr = occurredAt.toISOString().slice(0, 10);
  const normalizedDesc = description.trim().toLowerCase();
  const amtStr = Number(amount).toFixed(2);
  const acc = accountId ?? "unassigned";
  return createHash("sha256")
    .update(`${userId}|${acc}|${type}|${amtStr}|${normalizedDesc}|${dateStr}`)
    .digest("hex");
}

export async function detectDuplicates(
  userId: string,
  transactions: NormalizedTransaction[],
  accountId?: string | null
): Promise<{ transactions: NormalizedTransaction[]; duplicateCount: number }> {
  // Fetch user's existing transactions from MySQL
  const [existingRows] = await db.query(
    `SELECT 
      type, 
      ROUND(amount, 2) AS amount, 
      description, 
      DATE_FORMAT(occurred_at, '%Y-%m-%d') AS dateStr 
    FROM transactions 
    WHERE user_id = ?`,
    [userId]
  );

  const existingMap = new Set<string>();
  if (Array.isArray(existingRows)) {
    for (const row of existingRows as Array<{ type: string; amount: number; description: string; dateStr: string }>) {
      const key = `${row.type}|${Number(row.amount).toFixed(2)}|${row.dateStr}`;
      existingMap.add(key);
    }
  }

  let duplicateCount = 0;

  for (const tx of transactions) {
    const txDateStr = tx.occurredAt.toISOString().slice(0, 10);
    const key = `${tx.type}|${Number(tx.amount).toFixed(2)}|${txDateStr}`;

    if (existingMap.has(key)) {
      tx.duplicateStatus = "possible_duplicate";
      tx.selected = false; // Deselected by default for user review
      duplicateCount++;
    } else {
      tx.duplicateStatus = "new";
      tx.selected = true;
    }
  }

  return { transactions, duplicateCount };
}
