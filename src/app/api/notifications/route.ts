import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";

export async function GET() {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const [goals, accounts] = await Promise.all([
    db.query("SELECT name, target_date AS targetDate, current_amount AS currentAmount, target_amount AS targetAmount FROM goals WHERE user_id = ? AND target_date <= DATE_ADD(CURRENT_DATE, INTERVAL 90 DAY) ORDER BY target_date ASC LIMIT 5", [userId]),
    db.query("SELECT name, balance FROM accounts WHERE user_id = ? AND balance < 1000 ORDER BY balance ASC LIMIT 5", [userId]),
  ]);
  const notifications = [
    ...(goals[0] as Array<{ name: string; targetDate: string; currentAmount: number; targetAmount: number }>).map((goal) => ({ type: "goal", title: `${goal.name} target is approaching`, detail: `You are ${Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100)}% funded for ${new Date(goal.targetDate).toLocaleDateString("en-IN")}.` })),
    ...(accounts[0] as Array<{ name: string; balance: number }>).map((account) => ({ type: "balance", title: `${account.name} balance is low`, detail: `Current balance: ₹${Math.round(Number(account.balance)).toLocaleString("en-IN")}.` })),
  ];
  return NextResponse.json({ notifications });
}