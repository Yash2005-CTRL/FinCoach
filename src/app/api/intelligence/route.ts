import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/require-user";
import { computeComprehensiveIntelligence } from "@/lib/intelligence/engine";

export async function GET() {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  try {
    const intel = await computeComprehensiveIntelligence(userId);

    // Keep backwards-compatible summary while providing full intelligence payload
    return NextResponse.json({
      summary: {
        transactionCount: 0,
        income: intel.overview.monthlyIncome,
        expenses: intel.overview.monthlyExpenses,
        averageExpense: intel.overview.averageExpense,
        largestExpense: intel.overview.largestExpense?.amount ?? 0,
        savingsRate: intel.overview.savingsRate,
      },
      nextMove: intel.nextBestMove.whyFinCoachRecommendsThis,
      forecast: {
        next30Days: intel.cashFlowForecast.projectedSurplus,
        disclaimer: intel.cashFlowForecast.disclaimer,
      },
      recurring: intel.recurringPayments.map((r) => ({
        merchant: r.merchant,
        amount: r.averageAmount,
        count: r.count,
        annualized: r.annualizedCost,
      })),
      // Comprehensive Engine Outputs
      intel,
    });
  } catch (error) {
    console.error("Financial intelligence computation failed:", error);
    return NextResponse.json({ error: "Failed to compute financial intelligence." }, { status: 500 });
  }
}