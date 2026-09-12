import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";

type ScanTransaction = {
  id: string;
  occurredAt: string | Date;
  description: string;
  merchant: string | null;
  amount: number;
  type: "income" | "expense" | "transfer";
  category: string;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const { id: uploadId } = await context.params;
  if (!uploadId) return NextResponse.json({ error: "Upload ID required" }, { status: 400 });

  const [rows] = await db.query(
    `SELECT id, occurred_at AS occurredAt, description, merchant, amount, type, category
     FROM extracted_transactions
     WHERE upload_id = ? AND user_id = ?
     ORDER BY occurred_at ASC, id ASC`,
    [uploadId, userId]
  );
  const transactions = (Array.isArray(rows) ? rows : []) as ScanTransaction[];
  if (transactions.length === 0) {
    return NextResponse.json({ error: "No extracted transactions available yet." }, { status: 404 });
  }

  const expenses = transactions.filter((tx) => tx.type === "expense");
  const income = transactions.filter((tx) => tx.type === "income");
  const totalIncome = income.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const totalExpenses = expenses.reduce((sum, tx) => sum + Number(tx.amount), 0);

  const categoryTotals = new Map<string, number>();
  for (const tx of expenses) categoryTotals.set(tx.category, (categoryTotals.get(tx.category) ?? 0) + Number(tx.amount));
  const categories = [...categoryTotals.entries()]
    .map(([category, amount]) => ({ category, amount: round(amount), share: totalExpenses ? Math.round((amount / totalExpenses) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const merchantGroups = new Map<string, { amount: number; count: number; category: string; dates: Date[] }>();
  for (const tx of expenses) {
    const merchant = (tx.merchant || tx.description || "Unlabelled payment").trim();
    const item = merchantGroups.get(merchant) ?? { amount: 0, count: 0, category: tx.category, dates: [] };
    item.amount += Number(tx.amount);
    item.count += 1;
    item.dates.push(new Date(tx.occurredAt));
    merchantGroups.set(merchant, item);
  }

  const recurring = [...merchantGroups.entries()]
    .filter(([, item]) => item.count >= 2)
    .map(([merchant, item]) => ({
      merchant,
      category: item.category,
      count: item.count,
      averageAmount: round(item.amount / item.count),
      totalAmount: round(item.amount),
      annualized: round((item.amount / item.count) * 12),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 6);

  const leaks = recurring
    .filter((item) => /subscription|food|dining|shopping|entertainment|fee|charge|other expense/i.test(item.category) || item.count >= 4)
    .slice(0, 4)
    .map((item) => ({
      ...item,
      reason: item.count >= 4
        ? `${item.count} payments to this merchant suggest a repeat spending pattern.`
        : `This recurring ${item.category.toLowerCase()} could be reduced or cancelled if it is not essential.`,
    }));

  const topExpense = [...expenses].sort((a, b) => Number(b.amount) - Number(a.amount))[0] ?? null;
  const topCategory = categories[0];
  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : null;
  const summary = totalIncome > 0
    ? `You received ${formatINR(totalIncome)} and spent ${formatINR(totalExpenses)} in this statement, leaving an observed savings rate of ${savingsRate}%.`
    : `Your statement shows ${formatINR(totalExpenses)} in spending. ${topCategory ? `${topCategory.category} is your largest category at ${topCategory.share}% of expenses.` : ""}`;

  return NextResponse.json({
    summary,
    totals: { transactionCount: transactions.length, income: round(totalIncome), expenses: round(totalExpenses), net: round(totalIncome - totalExpenses), savingsRate },
    categories,
    recurring,
    leaks,
    topExpense: topExpense ? { description: topExpense.description, amount: round(Number(topExpense.amount)), category: topExpense.category } : null,
    insight: leaks.length > 0
      ? `${leaks[0].merchant} is the clearest repeat-spending opportunity in this statement. Review it before importing.`
      : topCategory
        ? `${topCategory.category} is driving the most spending in this statement. Set a limit for this category after import.`
        : "Your extracted transactions are ready for review and import.",
  });
}

function formatINR(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}