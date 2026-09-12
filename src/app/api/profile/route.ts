import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";

export async function GET() {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const [rows] = await db.query("SELECT id, name, email, currency FROM users WHERE id = ? LIMIT 1", [userId]);
  const user = Array.isArray(rows) ? rows[0] : null;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PUT(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Name must be between 2 and 120 characters" }, { status: 400 });
  await db.query("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
  return NextResponse.json({ user: { id: userId, name } });
}