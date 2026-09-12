import { db } from "@/lib/db";

export type HealthScoreBreakdown = {
  score: number;
  factors: { label: string; points: number; positive: boolean; explanation: string }[];
  summary: string;
};

export type MoneyLeak = {
  id: string;
  category: string;
  merchant: string;
  frequency: string;
  amount: number;
  annualizedReduction: number;
  reason: string;
  reducibleTag: "potentially reducible" | "discretionary" | "unusual";
};

export type RecurringPayment = {
  merchant: string;
  category: string;
  averageAmount: number;
  frequency: "monthly" | "weekly" | "irregular";
  count: number;
  annualizedCost: number;
  lastPaidDate: string;
  nextExpectedDate: string;
};

export type UnusualTransaction = {
  id: string;
  description: string;
  merchant: string | null;
  amount: number;
  category: string;
  occurredAt: string;
  deviationMultiplier: number;
  reason: string;
};

export type AvoidableTransaction = {
  id: string;
  description: string;
  merchant: string | null;
  amount: number;
  category: string;
  occurredAt: string;
  reason: string;
};

export type HighValueExpense = {
  id: string;
  description: string;
  merchant: string | null;
  amount: number;
  category: string;
  occurredAt: string;
};

export type CategoryBudgetSuggestion = {
  category: string;
  currentMonthlyAvg: number;
  suggestedBudget: number;
  potentialMonthlySavings: number;
};

export type GoalInsight = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  requiredMonthlySavings: number;
  projectedCompletionDate: string;
  status: "on_track" | "delayed" | "achieved";
  varianceMonths: number;
};

export type CashFlowForecast = {
  projectedIncome: number;
  recurringCommitments: number;
  estimatedDiscretionarySpend: number;
  projectedSurplus: number;
  confidenceScore: number;
  disclaimer: string;
};

export type ComprehensiveIntelligence = {
  overview: {
    totalNetWorth: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    savingsRate: number;
    averageExpense: number;
    largestExpense: { description: string; amount: number; date: string } | null;
    essentialSpending: number;
    discretionarySpending: number;
    essentialRatio: number;
  };
  healthScore: HealthScoreBreakdown;
  nextBestMove: {
    title: string;
    whyFinCoachRecommendsThis: string;
    actionLabel: string;
    actionType: string;
    impactEstimate: string;
  };
  moneyLeaks: MoneyLeak[];
  recurringPayments: RecurringPayment[];
  unusualTransactions: UnusualTransaction[];
  avoidableTransactions: AvoidableTransaction[];
  highValueExpenses: HighValueExpense[];
  monthOverMonth: {
    currentMonth: string;
    previousMonth: string;
    incomeChangePercent: number;
    expenseChangePercent: number;
    savingsRateDelta: number;
    primaryExpenseDriver: string;
  };
  cashFlowForecast: CashFlowForecast;
  budgetSuggestions: CategoryBudgetSuggestion[];
  goalInsights: GoalInsight[];
};

export async function computeComprehensiveIntelligence(userId: string): Promise<ComprehensiveIntelligence> {
  const [
    [accountRows],
    [transactionRows],
    [goalRows],
    [monthlyTrends]
  ] = await Promise.all([
    db.query("SELECT id, name, type, balance, currency FROM accounts WHERE user_id = ?", [userId]),
    db.query(
      `SELECT id, type, amount, description, merchant, category, occurred_at AS occurredAt, source
       FROM transactions 
       WHERE user_id = ? 
       ORDER BY occurred_at DESC`,
      [userId]
    ),
    db.query(
      `SELECT id, name, target_amount AS targetAmount, current_amount AS currentAmount, target_date AS targetDate, priority, updated_at AS updatedAt 
       FROM goals 
       WHERE user_id = ? 
       ORDER BY target_date ASC`,
      [userId]
    ),
    db.query(
      `SELECT 
        DATE_FORMAT(occurred_at, '%Y-%m') AS month, 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income, 
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses 
       FROM transactions 
       WHERE user_id = ? AND occurred_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(occurred_at, '%Y-%m') 
       ORDER BY month DESC`,
      [userId]
    ),
  ]);

  const accounts = Array.isArray(accountRows) ? (accountRows as any[]) : [];
  const allTransactions = Array.isArray(transactionRows) ? (transactionRows as any[]) : [];
  const goals = Array.isArray(goalRows) ? (goalRows as any[]) : [];
  const trends = Array.isArray(monthlyTrends) ? (monthlyTrends as any[]) : [];

  // Total Net Worth
  const totalNetWorth = accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

  // 30-Day Window Transactions
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentTransactions = allTransactions.filter((tx) => new Date(tx.occurredAt) >= thirtyDaysAgo);

  const monthlyIncome = recentTransactions
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  const monthlyExpenses = recentTransactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  const savingsRate = monthlyIncome > 0 ? Math.round(Math.max(0, ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)) : 0;

  const expenseTxs = recentTransactions.filter((tx) => tx.type === "expense");
  const averageExpense = expenseTxs.length > 0 ? Math.round(monthlyExpenses / expenseTxs.length) : 0;

  // Largest expense
  let largestExpense: { description: string; amount: number; date: string } | null = null;
  if (expenseTxs.length > 0) {
    const sorted = [...expenseTxs].sort((a, b) => Number(b.amount) - Number(a.amount));
    largestExpense = {
      description: sorted[0].description,
      amount: Number(sorted[0].amount),
      date: new Date(sorted[0].occurredAt).toLocaleDateString("en-IN"),
    };
  }

  // Essential vs Discretionary
  const ESSENTIAL_CATEGORIES = new Set(["Groceries", "Utilities", "Bills", "Healthcare", "Insurance", "Education"]);
  let essentialSpending = 0;
  let discretionarySpending = 0;

  for (const tx of expenseTxs) {
    const amt = Number(tx.amount);
    if (ESSENTIAL_CATEGORIES.has(tx.category)) {
      essentialSpending += amt;
    } else {
      discretionarySpending += amt;
    }
  }
  const essentialRatio = monthlyExpenses > 0 ? Math.round((essentialSpending / monthlyExpenses) * 100) : 50;

  // 1. Health Score Calculation with transparent breakdown
  const factors: HealthScoreBreakdown["factors"] = [];
  let baseScore = 40;

  // Savings rate factor
  if (savingsRate >= 30) {
    factors.push({ label: "High savings rate", points: 25, positive: true, explanation: `${savingsRate}% of observed income retained` });
    baseScore += 25;
  } else if (savingsRate >= 15) {
    factors.push({ label: "Moderate savings rate", points: 15, positive: true, explanation: `${savingsRate}% saved over last 30 days` });
    baseScore += 15;
  } else if (monthlyIncome > 0 && savingsRate < 10) {
    factors.push({ label: "Low savings buffer", points: -12, positive: false, explanation: `Only ${savingsRate}% saved, leaving narrow cushion` });
    baseScore -= 12;
  }

  // Emergency net worth factor
  const monthlyBurn = monthlyExpenses || 30000;
  const runwayMonths = totalNetWorth / monthlyBurn;
  if (runwayMonths >= 6) {
    factors.push({ label: "Solid liquidity reserve", points: 20, positive: true, explanation: `${runwayMonths.toFixed(1)} months of expense buffer` });
    baseScore += 20;
  } else if (runwayMonths >= 3) {
    factors.push({ label: "Basic emergency cushion", points: 10, positive: true, explanation: `${runwayMonths.toFixed(1)} months reserve available` });
    baseScore += 10;
  } else {
    factors.push({ label: "Thin liquidity buffer", points: -10, positive: false, explanation: `Under 3 months of emergency runway` });
    baseScore -= 10;
  }

  // Discretionary spending discipline
  if (monthlyExpenses > 0 && discretionarySpending / monthlyExpenses > 0.6) {
    factors.push({ label: "Elevated discretionary spending", points: -8, positive: false, explanation: `${Math.round((discretionarySpending / monthlyExpenses) * 100)}% spent on non-essentials` });
    baseScore -= 8;
  } else if (monthlyExpenses > 0 && essentialRatio >= 60) {
    factors.push({ label: "Disciplined essentials focus", points: 10, positive: true, explanation: `${essentialRatio}% directed toward essential needs` });
    baseScore += 10;
  }

  const finalHealthScore = Math.max(10, Math.min(100, Math.round(baseScore)));

  // 2. Recurring Payments & Money Leaks Detection
  const merchantGroup = new Map<string, { total: number; count: number; dates: Date[]; category: string }>();
  for (const tx of allTransactions.filter((t) => t.type === "expense")) {
    const m = tx.merchant || tx.description;
    if (!m) continue;
    const existing = merchantGroup.get(m) ?? { total: 0, count: 0, dates: [] as Date[], category: tx.category };
    existing.total += Number(tx.amount);
    existing.count += 1;
    existing.dates.push(new Date(tx.occurredAt));
    merchantGroup.set(m, existing);
  }

  const recurringPayments: RecurringPayment[] = [];
  const moneyLeaks: MoneyLeak[] = [];

  merchantGroup.forEach((data, merchant) => {
    if (data.count >= 2) {
      const avg = Math.round(data.total / data.count);
      const sortedDates = data.dates.sort((a, b) => b.getTime() - a.getTime());
      const lastDate = sortedDates[0];
      const nextDate = new Date(lastDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      const annualized = avg * 12;
      recurringPayments.push({
        merchant,
        category: data.category,
        averageAmount: avg,
        frequency: "monthly",
        count: data.count,
        annualizedCost: annualized,
        lastPaidDate: lastDate.toLocaleDateString("en-IN"),
        nextExpectedDate: nextDate.toLocaleDateString("en-IN"),
      });

      // Flag money leaks
      if (data.category === "Subscriptions" || /netflix|spotify|prime|hotstar|youtube|apple/i.test(merchant)) {
        moneyLeaks.push({
          id: `leak-${merchant}`,
          merchant,
          category: data.category,
          frequency: "Monthly subscription",
          amount: avg,
          annualizedReduction: annualized,
          reason: `Observed ${data.count} regular subscription payments. Cancelling unused commitments saves up to ₹${annualized.toLocaleString("en-IN")}/yr.`,
          reducibleTag: "potentially reducible",
        });
      } else if (data.category === "Food & Dining" && data.count >= 4) {
        moneyLeaks.push({
          id: `leak-${merchant}`,
          merchant,
          category: data.category,
          frequency: `${data.count} orders observed`,
          amount: data.total,
          annualizedReduction: Math.round(data.total * 3),
          reason: `High dining frequency detected across ${data.count} orders. Cooking or meal planning could save significant cash.`,
          reducibleTag: "discretionary",
        });
      }
    }
  });

  // 3. Statistically Unusual Transactions (> 2.5x category average)
  const categoryAverages = new Map<string, { sum: number; count: number }>();
  for (const tx of allTransactions.filter((t) => t.type === "expense")) {
    const existing = categoryAverages.get(tx.category) ?? { sum: 0, count: 0 };
    existing.sum += Number(tx.amount);
    existing.count += 1;
    categoryAverages.set(tx.category, existing);
  }

  const unusualTransactions: UnusualTransaction[] = [];
  for (const tx of expenseTxs) {
    const catStat = categoryAverages.get(tx.category);
    if (catStat && catStat.count >= 3) {
      const catAvg = catStat.sum / catStat.count;
      const amt = Number(tx.amount);
      if (amt >= 2.5 * catAvg && amt > 1500) {
        unusualTransactions.push({
          id: tx.id,
          description: tx.description,
          merchant: tx.merchant,
          amount: amt,
          category: tx.category,
          occurredAt: new Date(tx.occurredAt).toLocaleDateString("en-IN"),
          deviationMultiplier: Math.round((amt / catAvg) * 10) / 10,
          reason: `This amount is ${Math.round((amt / catAvg) * 10) / 10}x higher than your average ${tx.category} expense (₹${Math.round(catAvg).toLocaleString("en-IN")}).`,
        });
      }
    }
  }

  // Flag a single large discretionary expense even when there is not enough history for comparison.
  const largeDiscretionaryExpenses = expenseTxs
    .filter((tx) => {
      const amount = Number(tx.amount);
      const label = `${tx.description ?? ""} ${tx.merchant ?? ""} ${tx.category ?? ""}`;
      return amount >= 5000 && !ESSENTIAL_CATEGORIES.has(tx.category) && /dine|restaurant|food|swiggy|zomato|shopping|entertainment|gaming|games?|travel|subscription/i.test(label);
    })
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  for (const tx of largeDiscretionaryExpenses.slice(0, 3)) {
    if (unusualTransactions.some((item) => item.id === tx.id)) continue;
    const amount = Number(tx.amount);
    unusualTransactions.push({
      id: tx.id,
      description: tx.description,
      merchant: tx.merchant,
      amount,
      category: tx.category,
      occurredAt: new Date(tx.occurredAt).toLocaleDateString("en-IN"),
      deviationMultiplier: 0,
      reason: `This is a large discretionary purchase of ₹${Math.round(amount).toLocaleString("en-IN")}. Reducing similar purchases can create immediate room in your budget.`,
    });
  }

  // Keep a complete, category-specific list of high-value discretionary expenses.
  // This is intentionally based on the reason for the purchase, not recency.
  const avoidableCategoryPattern = /dine|restaurant|food|swiggy|zomato|shopping|travel|entertainment|gaming|games?|subscription/i;
  const avoidableTransactions: AvoidableTransaction[] = allTransactions
    .filter((tx) => {
      const amount = Number(tx.amount);
      const label = `${tx.description ?? ""} ${tx.merchant ?? ""} ${tx.category ?? ""}`;
      return tx.type === "expense" && amount > 5000 && avoidableCategoryPattern.test(label);
    })
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .map((tx) => ({
      id: tx.id,
      description: tx.description,
      merchant: tx.merchant,
      amount: Number(tx.amount),
      category: tx.category,
      occurredAt: new Date(tx.occurredAt).toLocaleDateString("en-IN"),
      reason: `Avoid repeating this ${tx.category || "discretionary"} expense or pause before making a similar purchase.`,
    }));

  const highValueExpenses: HighValueExpense[] = allTransactions
    .filter((tx) => tx.type === "expense" && Number(tx.amount) > 6000)
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .map((tx) => ({
      id: tx.id,
      description: tx.description,
      merchant: tx.merchant,
      amount: Number(tx.amount),
      category: tx.category,
      occurredAt: new Date(tx.occurredAt).toLocaleDateString("en-IN"),
    }));

  // 4. Month-over-Month Comparison
  const currentMo = trends[0] ?? { month: "Current", income: monthlyIncome, expenses: monthlyExpenses };
  const prevMo = trends[1] ?? { month: "Previous", income: 0, expenses: 0 };
  const prevIncome = Number(prevMo.income);
  const prevExp = Number(prevMo.expenses);
  const curIncome = Number(currentMo.income);
  const curExp = Number(currentMo.expenses);

  const incomeChangePercent = prevIncome > 0 ? Math.round(((curIncome - prevIncome) / prevIncome) * 100) : 0;
  const expenseChangePercent = prevExp > 0 ? Math.round(((curExp - prevExp) / prevExp) * 100) : 0;
  const prevSavingsRate = prevIncome > 0 ? Math.round(((prevIncome - prevExp) / prevIncome) * 100) : 0;

  // 5. 30-Day Cash Flow Forecast
  const projectedRecurring = recurringPayments.reduce((sum, r) => sum + r.averageAmount, 0);
  const estimatedDiscretionary = Math.max(0, monthlyExpenses - projectedRecurring);
  const projectedSurplus = monthlyIncome - (projectedRecurring + estimatedDiscretionary);

  const cashFlowForecast: CashFlowForecast = {
    projectedIncome: monthlyIncome,
    recurringCommitments: projectedRecurring,
    estimatedDiscretionarySpend: estimatedDiscretionary,
    projectedSurplus,
    confidenceScore: allTransactions.length >= 20 ? 85 : 60,
    disclaimer: "Forecast is an algorithmic estimate based on observed transaction history and is not a financial guarantee.",
  };

  // 6. Smart Budget Suggestions
  const budgetSuggestions: CategoryBudgetSuggestion[] = [];
  categoryAverages.forEach((val, cat) => {
    if (val.count >= 2 && !ESSENTIAL_CATEGORIES.has(cat)) {
      const monthlyAvg = Math.round(val.sum / Math.max(1, trends.length || 1));
      if (monthlyAvg > 2000) {
        const suggested = Math.round(monthlyAvg * 0.85); // 15% reduction suggestion
        budgetSuggestions.push({
          category: cat,
          currentMonthlyAvg: monthlyAvg,
          suggestedBudget: suggested,
          potentialMonthlySavings: monthlyAvg - suggested,
        });
      }
    }
  });

  // 7. Goal Insights
  const goalInsights: GoalInsight[] = goals.map((goal) => {
    const target = Number(goal.targetAmount);
    const current = Number(goal.currentAmount);
    const remaining = Math.max(0, target - current);
    const tDate = new Date(goal.targetDate);
    const monthsLeft = Math.max(1, (tDate.getFullYear() - now.getFullYear()) * 12 + tDate.getMonth() - now.getMonth());
    const reqMonthly = Math.round(remaining / monthsLeft);

    const actualMonthlyPace = Math.max(0, monthlyIncome - monthlyExpenses);
    const monthsToComplete = actualMonthlyPace > 0 ? Math.ceil(remaining / actualMonthlyPace) : 99;
    const projectedDate = new Date(now.getTime() + monthsToComplete * 30 * 24 * 60 * 60 * 1000);

    const isDelayed = monthsToComplete > monthsLeft;
    return {
      id: goal.id,
      name: goal.name,
      targetAmount: target,
      currentAmount: current,
      targetDate: tDate.toLocaleDateString("en-IN"),
      requiredMonthlySavings: reqMonthly,
      projectedCompletionDate: projectedDate.toLocaleDateString("en-IN"),
      status: remaining === 0 ? "achieved" : isDelayed ? "delayed" : "on_track",
      varianceMonths: Math.abs(monthsToComplete - monthsLeft),
    };
  });

  // 8. Your Next Best Move
  let nextBestMove = {
    title: "Build your starter emergency cushion",
    whyFinCoachRecommendsThis: "Your liquid savings buffer covers under 3 months of expenses.",
    actionLabel: "Set Emergency Goal",
    actionType: "CREATE_GOAL",
    impactEstimate: "Protects you against unforeseen cash flow shocks.",
  };

  if (runwayMonths < 3) {
    nextBestMove = {
      title: "Establish a 3-month emergency buffer",
      whyFinCoachRecommendsThis: `Your current net worth provides ${runwayMonths.toFixed(1)} months of runway. Reaching 3 months (₹${Math.round(monthlyBurn * 3).toLocaleString("en-IN")}) brings resilience.`,
      actionLabel: "Fund Emergency Reserve",
      actionType: "TRANSFER_FUNDS",
      impactEstimate: `Saves ₹${Math.round(monthlyBurn * 3 - totalNetWorth).toLocaleString("en-IN")} toward safety threshold.`,
    };
  } else if (moneyLeaks.length > 0) {
    const topLeak = moneyLeaks[0];
    nextBestMove = {
      title: `Audit recurring payments for ${topLeak.merchant}`,
      whyFinCoachRecommendsThis: `FinCoach detected ${topLeak.frequency} for ${topLeak.merchant} totalling ₹${topLeak.annualizedReduction.toLocaleString("en-IN")}/year.`,
      actionLabel: "Review Subscriptions",
      actionType: "AUDIT_LEAKS",
      impactEstimate: `Potential annual saving of ₹${topLeak.annualizedReduction.toLocaleString("en-IN")}.`,
    };
  } else if (savingsRate >= 25 && goals.length > 0) {
    const pendingGoal = goals
      .filter((g) => Number(g.currentAmount) < Number(g.targetAmount))
      .sort((a, b) => new Date(String(b.updatedAt ?? 0)).getTime() - new Date(String(a.updatedAt ?? 0)).getTime())[0];
    if (pendingGoal) {
      nextBestMove = {
        title: `Accelerate progress on "${pendingGoal.name}"`,
        whyFinCoachRecommendsThis: `Your strong savings rate of ${savingsRate}% gives you capacity to increase monthly contributions to ${pendingGoal.name}.`,
        actionLabel: "Increase Contribution",
        actionType: "CONTRIBUTE_GOAL",
        impactEstimate: `Shortens goal horizon by up to 2 months.`,
      };
    }
  }

  return {
    overview: {
      totalNetWorth,
      monthlyIncome,
      monthlyExpenses,
      savingsRate,
      averageExpense,
      largestExpense,
      essentialSpending,
      discretionarySpending,
      essentialRatio,
    },
    healthScore: {
      score: finalHealthScore,
      factors,
      summary: finalHealthScore >= 75 ? "Strong financial position with healthy savings" : finalHealthScore >= 50 ? "Stable foundation with room for expense optimization" : "Requires attention to liquidity and discretionary spending",
    },
    nextBestMove,
    moneyLeaks,
    recurringPayments,
    unusualTransactions,
    avoidableTransactions,
    highValueExpenses,
    monthOverMonth: {
      currentMonth: currentMo.month,
      previousMonth: prevMo.month,
      incomeChangePercent,
      expenseChangePercent,
      savingsRateDelta: savingsRate - prevSavingsRate,
      primaryExpenseDriver: largestExpense?.description ?? "Normal spending",
    },
    cashFlowForecast,
    budgetSuggestions,
    goalInsights,
  };
}
