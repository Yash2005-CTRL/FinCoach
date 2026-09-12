import { CATEGORY_TAXONOMY, NormalizedTransaction } from "./types";

const ALL_CATEGORIES = [
  ...CATEGORY_TAXONOMY.income,
  ...CATEGORY_TAXONOMY.expense,
  ...CATEGORY_TAXONOMY.transfer,
];

export async function enrichTransactionsWithAI(
  transactions: NormalizedTransaction[]
): Promise<NormalizedTransaction[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  // Identify ambiguous transactions needing AI classification
  const ambiguousIndices: number[] = [];
  const itemsToClassify: { index: number; description: string; amount: number; type: string }[] = [];

  transactions.forEach((tx, idx) => {
    if (tx.confidence < 70) {
      ambiguousIndices.push(idx);
      itemsToClassify.push({
        index: idx,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
      });
    }
  });

  // If no ambiguous transactions or no Gemini API key, return as-is
  if (itemsToClassify.length === 0 || !apiKey) {
    return transactions;
  }

  try {
    const prompt = `You are a financial transaction categorizer. Classify each of the following ambiguous Indian bank statement transactions into exactly one of these allowed categories:
${ALL_CATEGORIES.join(", ")}

Transactions to classify:
${JSON.stringify(itemsToClassify.slice(0, 30))}

Return a valid JSON array of objects with keys:
- "index": number (matching the input item index)
- "category": string (MUST be one of the allowed categories listed above)
- "merchant": string (clean normalized merchant or counterparty name, or empty string)
- "confidence": number (an integer between 60 and 95 based on classification certainty)

Respond ONLY with the raw JSON array.`;

    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!response.ok) {
      console.warn("Gemini classification returned status", response.status);
      return transactions;
    }

    const payload = await response.json();
    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return transactions;

    const classifications = JSON.parse(rawText) as Array<{
      index: number;
      category: string;
      merchant?: string;
      confidence?: number;
    }>;

    for (const item of classifications) {
      if (typeof item.index === "number" && transactions[item.index]) {
        const target = transactions[item.index];
        if (ALL_CATEGORIES.includes(item.category as any)) {
          target.category = item.category;
          target.confidence = Math.min(95, Math.max(60, Number(item.confidence ?? 80)));
        }
        if (item.merchant && item.merchant.trim().length > 1) {
          target.merchant = item.merchant.trim();
          target.description = target.merchant;
        }
      }
    }
  } catch (error) {
    console.warn("AI transaction classification error (falling back to deterministic tags):", error);
  }

  return transactions;
}
