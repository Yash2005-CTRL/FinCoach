import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";

export async function GET(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json({ results: [] });
  const term = `%${query.slice(0, 80)}%`;
  const [transactions, accounts, goals] = await Promise.all([
    db.query("SELECT id, 'Transaction' AS kind, description AS title, category AS detail, amount FROM transactions WHERE user_id = ? AND (description LIKE ? OR merchant LIKE ? OR category LIKE ?) ORDER BY occurred_at DESC LIMIT 8", [userId, term, term, term]),
    db.query("SELECT id, 'Account' AS kind, name AS title, institution AS detail, balance AS amount FROM accounts WHERE user_id = ? AND (name LIKE ? OR institution LIKE ?) LIMIT 8", [userId, term, term]),
    db.query("SELECT id, 'Goal' AS kind, name AS title, priority AS detail, target_amount AS amount FROM goals WHERE user_id = ? AND name LIKE ? LIMIT 8", [userId, term]),
  ]);
  return NextResponse.json({ results: [...(transactions[0] as object[]), ...(accounts[0] as object[]), ...(goals[0] as object[])] });
}