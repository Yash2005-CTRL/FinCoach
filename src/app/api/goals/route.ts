import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";
import { goalSchema } from "@/lib/validation";

export async function GET() {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const [rows] = await db.query("SELECT id, name, target_amount AS targetAmount, current_amount AS currentAmount, target_date AS targetDate, priority FROM goals WHERE user_id = ? ORDER BY target_date ASC", [userId]);
  return NextResponse.json({ goals: rows });
}

export async function POST(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const parsed = goalSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid goal data", details: parsed.error.flatten() }, { status: 400 });
  const goal = parsed.data;
  const id = randomUUID();
  await db.query("INSERT INTO goals (id, user_id, name, target_amount, current_amount, target_date, priority) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, userId, goal.name, goal.targetAmount, goal.currentAmount, goal.targetDate, goal.priority]);
  return NextResponse.json({ id, ...goal }, { status: 201 });
}

export async function PUT(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  const parsed = goalSchema.safeParse(await request.json());
  if (!id) return NextResponse.json({ error: "Goal id is required" }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: "Invalid goal data", details: parsed.error.flatten() }, { status: 400 });
  const goal = parsed.data;
  const [result] = await db.query("UPDATE goals SET name = ?, target_amount = ?, current_amount = ?, target_date = ?, priority = ? WHERE id = ? AND user_id = ?", [goal.name, goal.targetAmount, goal.currentAmount, goal.targetDate, goal.priority, id, userId]);
  if (typeof result === "object" && result !== null && "affectedRows" in result && result.affectedRows === 0) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Goal id is required" }, { status: 400 });
  const [result] = await db.query("DELETE FROM goals WHERE id = ? AND user_id = ?", [id, userId]);
  if (typeof result === "object" && result !== null && "affectedRows" in result && result.affectedRows === 0) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}