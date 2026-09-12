import { RawExtractedTransaction } from "./types";

function parseDate(str: string): Date | null {
  const clean = str.trim().replace(/[\/\.]/g, "-").replace(/[^0-9-]/g, "");

  // OCR may produce compact dates such as 01062026 or 0100-2026.
  const compact = clean.match(/^(\d{2})(\d{2})-?(\d{4})$/);
  if (compact) {
    const day = parseInt(compact[1]) || 1;
    const month = parseInt(compact[2]) || 6;
    const date = new Date(parseInt(compact[3]), month - 1, day, 12, 0, 0);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && !isNaN(date.getTime())) return date;
  }

  // OCR often drops the separator in dates such as 0106-2026.
  const compactDayMonth = clean.match(/^(\d{2})(\d{2})-(\d{4})$/);
  if (compactDayMonth) {
    const date = new Date(parseInt(compactDayMonth[3]), parseInt(compactDayMonth[2]) - 1, parseInt(compactDayMonth[1]), 12, 0, 0);
    if (!isNaN(date.getTime())) return date;
  }
  
  // DD-MM-YYYY or DD-MM-YY
  const ddmmyyyy = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (ddmmyyyy) {
    let [, d, m, y] = ddmmyyyy;
    if (y.length === 2) y = `20${y}`;
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
    if (!isNaN(date.getTime())) return date;
  }

  // YYYY-MM-DD
  const yyyymmdd = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyymmdd) {
    const [, y, m, d] = yyyymmdd;
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

function parseAmount(str: string): number {
  const clean = str.replace(/[₹]/g, "").replace(/^rs\.?\s*|^inr\.?\s*/i, "").replace(/,/g, "").trim();
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : Math.abs(val);
}

function cleanExtractedTransactions(transactions: RawExtractedTransaction[]): RawExtractedTransaction[] {
  const validYears = transactions.map((transaction) => transaction.occurredAt.getFullYear()).filter((year) => year >= 2000 && year <= new Date().getFullYear() + 1);
  const yearCounts = new Map<number, number>();
  for (const year of validYears) yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
  const statementYear = [...yearCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? new Date().getFullYear();
  const seen = new Set<string>();

  return transactions
    .filter((transaction) => transaction.amount > 0 && !/opening|opee.*balance/i.test(transaction.rawDescription))
    .map((transaction) => {
      const date = new Date(transaction.occurredAt);
      if (date.getFullYear() !== statementYear) date.setFullYear(statementYear);
      return { ...transaction, occurredAt: date };
    })
    .filter((transaction) => {
      const key = `${transaction.occurredAt.toISOString().slice(0, 10)}|${transaction.amount}|${transaction.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function extractTransactionsFromText(text: string): RawExtractedTransaction[] {
  const transactions: RawExtractedTransaction[] = [];
  const lines = text
    .replace(/\r/g, "\n")
    .replace(/\s+(?=\d{1,2}[)]?\s+(?:\d{4}|[A-Za-z]))/g, "\n")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Strategy 1: Tabular single-line or multi-column regex match
  // Matches: Date ... Description ... Amount (Dr/Cr) ... Balance
  const amountPattern = "(?:₹\\s*|rs\\.?\\s*|inr\\.?\\s*)?[0-9,]+(?:\\.[0-9]{1,2})?";
  const rowRegex = new RegExp(`^(\\d{1,2}[\\-\\/.]\\d{1,2}[\\-\\/.]\\d{2,4})\\s+(?:(\\d{1,2}[\\-\\/.]\\d{1,2}[\\-\\/.]\\d{2,4})\\s+)?(.+?)\\s+(${amountPattern})\\s*(CR|DR|CREDIT|DEBIT|cr|dr|credit|debit)?(?:\\s+(${amountPattern}))?$`);

  for (const line of lines) {
    const match = line.match(rowRegex);
    if (match) {
      const [, dateStr, , desc, amtStr, crdr, balanceStr] = match;
      const date = parseDate(dateStr);
      const amount = parseAmount(amtStr);
      if (date && amount > 0) {
        let type: "income" | "expense" | "transfer" = "expense";
        if (crdr && /cr|credit/i.test(crdr)) {
          type = "income";
        } else if (/salary|refund|cashback|interest|credit/i.test(desc) && !/debit|dr|swiggy|zomato/i.test(desc)) {
          type = "income";
        }

        transactions.push({
          occurredAt: date,
          rawDescription: desc.trim(),
          amount,
          type,
          balance: balanceStr ? parseAmount(balanceStr) : undefined,
        });
      }
    }
  }

  if (transactions.length >= 5) {
    return cleanExtractedTransactions(transactions);
  }

  // Strategy 2: Columnar/Separated Block Extraction (common in Bank of Baroda, SBI PDF exports)
  // Extract all transaction dates
  const dateEntries: { date: Date; lineIndex: number }[] = [];
  const descEntries: { text: string; lineIndex: number }[] = [];
  const amountEntries: { amount: number; isCredit: boolean; lineIndex: number }[] = [];

  const dateRegex = /^(?:\d+\s+)?((?:\d{2}[\-\/\.]\d{2}|\d{4})[\-\/.]?\d{4}|\d{2}[\-\/\.]\d{2}[\-\/\.]\d{4})(?:\s+(?:\d{2}[\-\/\.]\d{2}|\d{8})[\-\/\.]?\d{4})?$/;
  const isExcludedDesc = (s: string) =>
    /serial|transaction|account|statement|details|opening|closing|balance|cheque|description|page\s+\d+|note:/i.test(
      s
    );

  lines.forEach((line, idx) => {
    // Check if line is a transaction date
    const dMatch = line.match(dateRegex);
    if (dMatch && !/statement\s+from/i.test(line)) {
      const d = parseDate(dMatch[1]);
      if (d) dateEntries.push({ date: d, lineIndex: idx });
      return;
    }

    // Check if line is an amount (e.g. 420.00 or 1,500.00 Cr)
    const amtMatch = line.match(/^(?:₹\s*|rs\.?\s*|inr\.?\s*)?([0-9,]+(?:\.\d{1,2})?)\s*(CR|DR|CREDIT|DEBIT|cr|dr|credit|debit)?$/);
    if (amtMatch) {
      const amt = parseAmount(amtMatch[1]);
      const isCr = amtMatch[2] ? /cr|credit/i.test(amtMatch[2]) : false;
      if (amt > 0) {
        amountEntries.push({ amount: amt, isCredit: isCr, lineIndex: idx });
      }
      return;
    }

    // Check if line is a transaction description (UPI, NEFT, POS, DR, CR)
    if (
      (line.startsWith("UPI/") ||
        line.startsWith("UP/") ||
        line.startsWith("UPV") ||
        line.startsWith("UPU") ||
        line.startsWith("DR:") ||
        line.startsWith("CR:") ||
        line.startsWith("NEFT") ||
        line.startsWith("IMPS") ||
        line.startsWith("POS ") ||
        line.includes("@")) &&
      !isExcludedDesc(line)
    ) {
      descEntries.push({ text: line, lineIndex: idx });
    }
  });

  // If columnar elements found, correlate them in sequence
  if (descEntries.length > 0 && amountEntries.length > 0) {
    const totalCount = Math.min(descEntries.length, amountEntries.length);
    for (let i = 0; i < totalCount; i++) {
      const desc = descEntries[i].text;
      const amtInfo = amountEntries[i];
      // Use corresponding date, or previous date, or today
      const date = dateEntries[i]?.date ?? dateEntries[dateEntries.length - 1]?.date ?? new Date();

      let type: "income" | "expense" | "transfer" = amtInfo.isCredit ? "income" : "expense";
      if (/salary|refund|interest|credited/i.test(desc) && !/debit/i.test(desc)) {
        type = "income";
      }

      transactions.push({
        occurredAt: date,
        rawDescription: desc,
        amount: amtInfo.amount,
        type,
      });
    }
  }

  // OCR may place dates, descriptions, and amounts in separate columns or lines.
  // Preserve usable financial rows even when the description column is unreadable.
  if (transactions.length === 0 && dateEntries.length > 0 && amountEntries.length > 0) {
    const totalCount = Math.min(dateEntries.length, amountEntries.length);
    for (let i = 0; i < totalCount; i++) {
      transactions.push({
        occurredAt: dateEntries[i].date,
        rawDescription: "Bank statement transaction",
        amount: amountEntries[i].amount,
        type: amountEntries[i].isCredit ? "income" : "expense",
      });
    }
  }

  // Last OCR fallback: recover a row from a date and the first monetary value
  // on the same noisy table line, even when column spacing was lost.
  if (transactions.length < 5) {
    const noisyDateRegex = /\b(?:\d{2}[\-\/.]\d{2}[\-\/.]\d{4}|\d{8}|\d{4}-\d{4})\b/g;
    const noisyAmountRegex = /(?:₹\s*|rs\.?\s*|inr\.?\s*)?\d[\d,]*(?:\.\d{1,2})?/gi;
    const existingRows = new Set(transactions.map((row) => `${row.occurredAt.toISOString().slice(0, 10)}|${row.amount}`));
    const knownDate = lines
      .flatMap((line) => [...line.matchAll(noisyDateRegex)].map((match) => parseDate(match[0])))
      .find((date): date is Date => date instanceof Date && date.getFullYear() >= 2020 && date.getFullYear() <= new Date().getFullYear() + 1);
    for (const line of lines) {
      if (/open(?:ing)?|opee.*balance/i.test(line)) continue;
      const dateTokens = [...line.matchAll(noisyDateRegex)].map((match) => match[0]);
      const dateToken = dateTokens.find((token) => parseDate(token)?.getFullYear() === knownDate?.getFullYear()) ?? dateTokens[0];
      const date = dateToken ? parseDate(dateToken) : null;
      const rowDate: Date | null = date ?? knownDate ?? null;
      if (!rowDate) continue;
      const amounts = [...line.matchAll(noisyAmountRegex)]
        .filter((match) => {
          const start = match.index ?? 0;
          const before = line[start - 1] ?? " ";
          const after = line[start + match[0].length] ?? " ";
          return !/^\d{4}$/.test(match[0]) && !/^\d{8}$/.test(match[0]) && parseAmount(match[0]) > 0 && !/[A-Za-z.]/.test(before) && !/[A-Za-z]/.test(after);
        })
        .map((match) => match[0]);
      const rowNumber = line.match(/^\d{1,2}[)]?\s/)?.[0].trim().replace(")", "");
      const usableAmounts = amounts.filter((value) => value !== rowNumber);
      const amount = usableAmounts.find((value) => /[.,₹]|rs|inr/i.test(value)) ?? usableAmounts[0];
      if (!amount) continue;
      const rowKey = `${rowDate.toISOString().slice(0, 10)}|${parseAmount(amount)}`;
      if (existingRows.has(rowKey)) continue;
      existingRows.add(rowKey);
      transactions.push({
        occurredAt: rowDate,
        rawDescription: line.replace(dateToken, "").slice(0, 140).trim() || "Bank statement transaction",
        amount: parseAmount(amount),
        type: /credit|\bcr\b/i.test(line) ? "income" : "expense",
      });
    }
  }

  // Strategy 3: General fallback line scan for embedded transaction patterns
  if (transactions.length === 0) {
    for (const line of lines) {
      const embeddedMatch = line.match(/(\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{2,4}).+?([0-9,]+\.\d{2})/);
      if (embeddedMatch) {
        const d = parseDate(embeddedMatch[1]);
        const amt = parseAmount(embeddedMatch[2]);
        if (d && amt > 0 && !isExcludedDesc(line)) {
          transactions.push({
            occurredAt: d,
            rawDescription: line.slice(0, 140),
            amount: amt,
            type: /cr|credit|salary/i.test(line) ? "income" : "expense",
          });
        }
      }
    }
  }

  return cleanExtractedTransactions(transactions);
}
