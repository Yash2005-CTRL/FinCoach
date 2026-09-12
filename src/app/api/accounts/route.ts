import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";
import { accountSchema } from "@/lib/validation";

export async function GET() {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const [rows] = await db.query("SELECT id, name, account_number AS accountNumber, type, institution, currency, created_at AS createdAt FROM accounts WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  return NextResponse.json({ accounts: rows });
}

export async function POST(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const parsed = accountSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid account data", details: parsed.error.flatten() }, { status: 400 });
  const account = parsed.data;
  const id = randomUUID();
  await db.query("INSERT INTO accounts (id, user_id, name, account_number, type, institution, balance, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, userId, account.name, account.accountNumber ?? null, account.type, account.institution ?? null, account.balance, account.currency]);
  return NextResponse.json({ id, ...account }, { status: 201 });
}

export async function PUT(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  const parsed = accountSchema.safeParse(await request.json());
  if (!id) return NextResponse.json({ error: "Account id is required" }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: "Invalid account data", details: parsed.error.flatten() }, { status: 400 });
  const account = parsed.data;
  try {
    const [result] = await db.query("UPDATE accounts SET name = ?, account_number = ?, type = ?, institution = ?, balance = ?, currency = ? WHERE id = ? AND user_id = ?", [account.name, account.accountNumber ?? null, account.type, account.institution ?? null, account.balance, account.currency, id, userId]);
    if (typeof result === "object" && result !== null && "affectedRows" in result && result.affectedRows === 0) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") return NextResponse.json({ error: "That account number is already in use" }, { status: 409 });
    console.error("Account update failed", error);
    return NextResponse.json({ error: "Unable to update account" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Account id is required" }, { status: 400 });
  const [result] = await db.query("DELETE FROM accounts WHERE id = ? AND user_id = ?", [id, userId]);
  if (typeof result === "object" && result !== null && "affectedRows" in result && result.affectedRows === 0) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}