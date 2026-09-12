import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";

export async function GET() {
  try {
    const userId = await requireUser();
    if (!userId) return unauthorized();
    const [[userRows], [totalIncomeRows], [cashFlowRows], [spendingRows], [goalRows], [trendRows]] = await Promise.all([
      db.query("SELECT id, name, email, currency FROM users WHERE id = ? LIMIT 1", [userId]),
      db.query("SELECT COALESCE(SUM(amount), 0) AS totalIncome FROM transactions WHERE user_id = ? AND type = 'income'", [userId]),
      db.query("SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income, COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses FROM transactions WHERE user_id = ? AND occurred_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AND occurred_at < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)", [userId]),
      db.query("SELECT category, SUM(amount) AS amount FROM transactions WHERE user_id = ? AND type = 'expense' AND occurred_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AND occurred_at < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH) GROUP BY category ORDER BY amount DESC", [userId]),
      db.query("SELECT id, name, target_amount AS targetAmount, current_amount AS currentAmount, target_date AS targetDate, priority FROM goals WHERE user_id = ? ORDER BY target_date ASC LIMIT 5", [userId]),
      db.query("SELECT DATE_FORMAT(occurred_at, '%Y-%m') AS month, COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income, COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses FROM transactions WHERE user_id = ? AND occurred_at >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 5 MONTH) AND occurred_at < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH) GROUP BY DATE_FORMAT(occurred_at, '%Y-%m') ORDER BY month ASC", [userId]),
    ]);
  const user = Array.isArray(userRows) ? userRows[0] : null;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const flow = (cashFlowRows as Array<{ income: number; expenses: number }>)[0] ?? { income: 0, expenses: 0 };
  const income = Number(flow.income);
  const expenses = Number(flow.expenses);
  const totalIncome = Number((totalIncomeRows as Array<{ totalIncome: number }>)[0]?.totalIncome ?? 0);
  const assets = income - expenses;
  const savingsRate = income > 0 ? Math.max(0, Math.min(100, ((income - expenses) / income) * 100)) : 0;
  const goalList = goalRows as Array<{ targetAmount: number; currentAmount: number; targetDate: string | Date }>;
  const now = new Date();
  const requiredGoalSavings = goalList.reduce((sum, goal) => {
    const remaining = Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount));
    const targetDate = new Date(goal.targetDate);
    const months = Math.max(1, (targetDate.getFullYear() - now.getFullYear()) * 12 + targetDate.getMonth() - now.getMonth());
    return sum + remaining / months;
  }, 0);
  const goalProgress = goalList.length
    ? goalList.reduce((sum, goal) => sum + Math.min(100, (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100), 0) / goalList.length
    : 0;
  const healthScore = Math.round(Math.min(100, savingsRate * 0.55 + Math.min(100, assets > 0 ? 60 + assets / 100000 : 0) * 0.25 + goalProgress * 0.2));
    return NextResponse.json({ user, snapshot: { totalAssets: assets, totalIncome, monthlyIncome: income, monthlyExpenses: expenses, monthlySavings: requiredGoalSavings, requiredGoalSavings, availableToSpend: income - expenses - requiredGoalSavings }, health: { score: healthScore, savingsRate: Math.round(savingsRate), goalProgress: Math.round(goalProgress), assets: Math.round(Math.min(100, assets > 0 ? 60 + assets / 100000 : 0)) }, spending: spendingRows, cashFlow: trendRows, goals: goalRows });
  } catch (error) {
    console.error("Dashboard request failed", error);
    return NextResponse.json({ error: "Unable to load dashboard data" }, { status: 503 });
  }
}