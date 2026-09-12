import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";
import { transactionSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 100);
  const accountNumber = searchParams.get("accountNumber")?.trim();
  const query = accountNumber
    ? "SELECT t.id, t.type, t.amount, t.description, DATE_FORMAT(t.occurred_at, '%d %b %Y, %h:%i %p') AS merchant, t.category, t.upload_id AS uploadId, t.account_id AS accountId, a.name AS accountName, a.account_number AS accountNumber, t.occurred_at AS occurredAt FROM transactions t INNER JOIN accounts a ON a.id = t.account_id WHERE t.user_id = ? AND a.account_number = ? ORDER BY t.occurred_at DESC LIMIT ?"
    : "SELECT t.id, t.type, t.amount, t.description, DATE_FORMAT(t.occurred_at, '%d %b %Y, %h:%i %p') AS merchant, t.category, t.upload_id AS uploadId, t.account_id AS accountId, a.name AS accountName, a.account_number AS accountNumber, t.occurred_at AS occurredAt FROM transactions t INNER JOIN accounts a ON a.id = t.account_id WHERE t.user_id = ? ORDER BY t.occurred_at DESC LIMIT ?";
  const [rows] = await db.query(query, accountNumber ? [userId, accountNumber, limit] : [userId, limit]);
  return NextResponse.json({ transactions: rows });
}

export async function POST(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const parsed = transactionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid transaction data", details: parsed.error.flatten() }, { status: 400 });
  const transaction = parsed.data;
  const [accountRows] = await db.query("SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1", [transaction.accountId, userId]);
  if (!Array.isArray(accountRows) || accountRows.length === 0) return NextResponse.json({ error: "That account does not belong to you" }, { status: 403 });
  const occurredAt = transaction.occurredAt ?? new Date();
  const fingerprint = createHash("sha256").update(`${userId}|${transaction.accountId}|${transaction.type}|${transaction.amount}|${transaction.description}|${occurredAt.toISOString()}`).digest("hex");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("INSERT INTO transactions (id, user_id, account_id, type, amount, description, merchant, category, occurred_at, fingerprint, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')", [randomUUID(), userId, transaction.accountId, transaction.type, transaction.amount, transaction.description, transaction.merchant ?? null, transaction.category, occurredAt, fingerprint]);
    if (transaction.type === "income" || transaction.type === "expense") {
      const balanceChange = transaction.type === "income" ? transaction.amount : -transaction.amount;
      await connection.query("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?", [balanceChange, transaction.accountId, userId]);
    }
    await connection.commit();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    await connection.rollback();
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") return NextResponse.json({ error: "This transaction was already imported" }, { status: 409 });
    console.error("Transaction insert failed", error);
    return NextResponse.json({ error: "Unable to create transaction" }, { status: 500 });
  } finally {
    connection.release();
  }
}

export async function PUT(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Transaction id is required" }, { status: 400 });
  const parsed = transactionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid transaction data", details: parsed.error.flatten() }, { status: 400 });
  const transaction = parsed.data;
  const occurredAt = transaction.occurredAt ?? new Date();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [oldRows] = await connection.query("SELECT account_id AS accountId, type, amount FROM transactions WHERE id = ? AND user_id = ? FOR UPDATE", [id, userId]);
    const old = Array.isArray(oldRows) ? oldRows[0] as { accountId: string; type: string; amount: number } | undefined : undefined;
    if (!old) { await connection.rollback(); return NextResponse.json({ error: "Transaction not found" }, { status: 404 }); }
    const [accountRows] = await connection.query("SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1", [transaction.accountId, userId]);
    if (!Array.isArray(accountRows) || accountRows.length === 0) { await connection.rollback(); return NextResponse.json({ error: "That account does not belong to you" }, { status: 403 }); }
    if (old.type === "income" || old.type === "expense") {
      await connection.query("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?", [old.type === "income" ? -old.amount : old.amount, old.accountId, userId]);
    }
    const fingerprint = createHash("sha256").update(`${userId}|${transaction.accountId}|${transaction.type}|${transaction.amount}|${transaction.description}|${occurredAt.toISOString()}`).digest("hex");
    await connection.query("UPDATE transactions SET account_id = ?, type = ?, amount = ?, description = ?, merchant = ?, category = ?, occurred_at = ?, fingerprint = ?, source = 'manual' WHERE id = ? AND user_id = ?", [transaction.accountId, transaction.type, transaction.amount, transaction.description, transaction.merchant ?? null, transaction.category, occurredAt, fingerprint, id, userId]);
    if (transaction.type === "income" || transaction.type === "expense") {
      await connection.query("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?", [transaction.type === "income" ? transaction.amount : -transaction.amount, transaction.accountId, userId]);
    }
    await connection.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") return NextResponse.json({ error: "This transaction already exists" }, { status: 409 });
    console.error("Transaction update failed", error);
    return NextResponse.json({ error: "Unable to update transaction" }, { status: 500 });
  } finally {
    connection.release();
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Transaction id is required" }, { status: 400 });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT account_id AS accountId, type, amount FROM transactions WHERE id = ? AND user_id = ? FOR UPDATE", [id, userId]);
    const transaction = Array.isArray(rows) ? rows[0] as { accountId: string; type: string; amount: number } | undefined : undefined;
    if (!transaction) { await connection.rollback(); return NextResponse.json({ error: "Transaction not found" }, { status: 404 }); }
    await connection.query("DELETE FROM transactions WHERE id = ? AND user_id = ?", [id, userId]);
    if (transaction.type === "income" || transaction.type === "expense") await connection.query("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?", [transaction.type === "income" ? -transaction.amount : transaction.amount, transaction.accountId, userId]);
    await connection.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    console.error("Transaction delete failed", error);
    return NextResponse.json({ error: "Unable to delete transaction" }, { status: 500 });
  } finally {
    connection.release();
  }
}