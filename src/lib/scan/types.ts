export type BankInfo = {
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  accountType: string | null;
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;   // YYYY-MM-DD
  closingBalance: number | null;
  currency: string;
  confidence: number; // 0 - 100
};

export type RawExtractedTransaction = {
  occurredAt: Date;
  rawDescription: string;
  reference?: string;
  debit?: number;
  credit?: number;
  amount: number;
  type: "income" | "expense" | "transfer";
  balance?: number;
};

export type NormalizedTransaction = {
  occurredAt: Date;
  description: string;
  merchant?: string;
  reference?: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  category: string;
  confidence: number;
  balance?: number;
  duplicateStatus: "new" | "possible_duplicate" | "keep_existing" | "imported";
  selected: boolean;
};

export const CATEGORY_TAXONOMY = {
  income: [
    "Salary",
    "Freelance",
    "Business",
    "Interest",
    "Dividend",
    "Rental",
    "Other Income",
  ],
  expense: [
    "Food & Dining",
    "Groceries",
    "Shopping",
    "Transport",
    "Bills",
    "Utilities",
    "Healthcare",
    "Education",
    "Entertainment",
    "Travel",
    "Insurance",
    "Subscriptions",
    "Fees & Charges",
    "Other Expense",
  ],
  transfer: [
    "Bank transfer",
    "Own account transfer",
    "Credit card payment",
    "Investment transfer",
    "Cash withdrawal",
  ],
} as const;

export type ProcessingStep =
  | "Statement uploaded"
  | "Bank & account detected"
  | "Transactions extracted"
  | "Transactions normalized"
  | "AI categorized"
  | "Duplicates checked"
  | "Ready for review"
  | "Imported to workspace";
