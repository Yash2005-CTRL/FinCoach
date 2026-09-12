import { NormalizedTransaction, RawExtractedTransaction } from "./types";

interface MerchantRule {
  pattern: RegExp;
  merchant: string;
  category: string;
  type: "income" | "expense" | "transfer";
  confidence: number;
}

const KNOWN_RULES: MerchantRule[] = [
  // Food & Dining
  { pattern: /zomato/i, merchant: "Zomato", category: "Food & Dining", type: "expense", confidence: 95 },
  { pattern: /swiggy(?!.*instamart|.*genie)/i, merchant: "Swiggy", category: "Food & Dining", type: "expense", confidence: 95 },
  { pattern: /mcdonald|starbucks|domino|kfc|burger\s*king|subway|pizza\s*hut/i, merchant: "Dining", category: "Food & Dining", type: "expense", confidence: 92 },
  
  // Groceries
  { pattern: /zepto/i, merchant: "Zepto", category: "Groceries", type: "expense", confidence: 95 },
  { pattern: /blinkit/i, merchant: "Blinkit", category: "Groceries", type: "expense", confidence: 95 },
  { pattern: /instamart/i, merchant: "Swiggy Instamart", category: "Groceries", type: "expense", confidence: 95 },
  { pattern: /bigbasket|bb\s*daily/i, merchant: "BigBasket", category: "Groceries", type: "expense", confidence: 95 },
  { pattern: /dmart|reliance\s*fresh|nature\s*basket/i, merchant: "Supermarket", category: "Groceries", type: "expense", confidence: 90 },

  // Transport & Travel
  { pattern: /uber/i, merchant: "Uber", category: "Transport", type: "expense", confidence: 95 },
  { pattern: /ola/i, merchant: "Ola", category: "Transport", type: "expense", confidence: 95 },
  { pattern: /rapido/i, merchant: "Rapido", category: "Transport", type: "expense", confidence: 95 },
  { pattern: /irctc/i, merchant: "IRCTC", category: "Travel", type: "expense", confidence: 95 },
  { pattern: /makemytrip|goibibo|easemytrip|cleartrip|yatra/i, merchant: "Travel", category: "Travel", type: "expense", confidence: 92 },
  { pattern: /metro|fuel|petrol|hpcl|bpcl|iocl/i, merchant: "Fuel / Transit", category: "Transport", type: "expense", confidence: 88 },

  // Shopping
  { pattern: /amazon(?!.*prime)/i, merchant: "Amazon", category: "Shopping", type: "expense", confidence: 92 },
  { pattern: /flipkart/i, merchant: "Flipkart", category: "Shopping", type: "expense", confidence: 92 },
  { pattern: /myntra|ajio|nykaa|tata\s*cliq|zara|h&m/i, merchant: "Shopping", category: "Shopping", type: "expense", confidence: 90 },

  // Subscriptions & Entertainment
  { pattern: /netflix/i, merchant: "Netflix", category: "Subscriptions", type: "expense", confidence: 98 },
  { pattern: /spotify/i, merchant: "Spotify", category: "Subscriptions", type: "expense", confidence: 98 },
  { pattern: /hotstar|disney/i, merchant: "Disney+ Hotstar", category: "Subscriptions", type: "expense", confidence: 95 },
  { pattern: /prime\s*video|amazon\s*prime/i, merchant: "Amazon Prime", category: "Subscriptions", type: "expense", confidence: 95 },
  { pattern: /bookmyshow|pvr|inox/i, merchant: "Movies / Entertainment", category: "Entertainment", type: "expense", confidence: 90 },
  { pattern: /youtube\s*premium/i, merchant: "YouTube Premium", category: "Subscriptions", type: "expense", confidence: 98 },
  { pattern: /apple\.com\/bill|itunes/i, merchant: "Apple Services", category: "Subscriptions", type: "expense", confidence: 90 },

  // Utilities & Bills
  { pattern: /bescom|mahadiscom|tneb|adani\s*electricity|bses|tata\s*power/i, merchant: "Electricity Board", category: "Utilities", type: "expense", confidence: 95 },
  { pattern: /airtel/i, merchant: "Airtel", category: "Bills", type: "expense", confidence: 90 },
  { pattern: /jio/i, merchant: "Jio", category: "Bills", type: "expense", confidence: 90 },
  { pattern: /vodafone|vi\s*bill/i, merchant: "Vi Telecom", category: "Bills", type: "expense", confidence: 90 },
  { pattern: /act\s*fibernet|hathway/i, merchant: "Internet Provider", category: "Bills", type: "expense", confidence: 90 },

  // Insurance & Healthcare
  { pattern: /pmjjby|pmsby/i, merchant: "Govt Life Insurance", category: "Insurance", type: "expense", confidence: 96 },
  { pattern: /lic\s*of\s*india|hdfc\s*life|max\s*life|icici\s*pru|star\s*health|policybazaar/i, merchant: "Insurance", category: "Insurance", type: "expense", confidence: 92 },
  { pattern: /apollo|pharmeasy|1mg|netmeds|practo/i, merchant: "Pharmacy / Healthcare", category: "Healthcare", type: "expense", confidence: 92 },

  // Banking Fees
  { pattern: /chg|charge|sms\s*chg|amc|debit\s*card\s*fee|penal|minimum\s*balance/i, merchant: "Bank", category: "Fees & Charges", type: "expense", confidence: 90 },

  // Transfers & Credit Cards
  { pattern: /cred\.club|cred\b/i, merchant: "CRED", category: "Credit card payment", type: "transfer", confidence: 95 },
  { pattern: /atm\s*w/i, merchant: "Cash ATM", category: "Cash withdrawal", type: "transfer", confidence: 95 },
  { pattern: /zerodha/i, merchant: "Zerodha", category: "Investment transfer", type: "transfer", confidence: 95 },
  { pattern: /groww/i, merchant: "Groww", category: "Investment transfer", type: "transfer", confidence: 95 },
  { pattern: /upstox/i, merchant: "Upstox", category: "Investment transfer", type: "transfer", confidence: 95 },

  // Income
  { pattern: /salary|payroll|stipend|wages/i, merchant: "Employer", category: "Salary", type: "income", confidence: 95 },
  { pattern: /int\.pd|interest\s*credit/i, merchant: "Savings Interest", category: "Interest", type: "income", confidence: 95 },
  { pattern: /dividend/i, merchant: "Dividend", category: "Dividend", type: "income", confidence: 95 },
];

export function normalizeRawTransaction(raw: RawExtractedTransaction): NormalizedTransaction {
  const text = raw.rawDescription.trim();
  let cleanedDesc = text;
  let detectedMerchant: string | undefined = undefined;
  let category = "Other Expense";
  let type = raw.type;
  let confidence = 50;

  // Extract reference number if not already present
  let reference = raw.reference;
  if (!reference) {
    const refMatch = text.match(/(?:UPI|IMPS|NEFT|RRN|UTR)[\/:\s]+([A-Za-z0-9]{8,22})/i);
    if (refMatch) {
      reference = refMatch[1];
    }
  }

  // Attempt matching known rules
  for (const rule of KNOWN_RULES) {
    if (rule.pattern.test(text)) {
      detectedMerchant = rule.merchant;
      category = rule.category;
      type = rule.type;
      confidence = rule.confidence;
      break;
    }
  }

  // If still generic, check if UPI handle gives merchant/person info
  if (!detectedMerchant && /UPI/i.test(text)) {
    const upiMatch = text.match(/(?:UPI\/[^\/]+\/[^\/]+\/UPI\/|UPI\/)([a-zA-Z0-9\.\_\-]+)@([a-zA-Z0-9]+)/i);
    if (upiMatch) {
      const handleUser = upiMatch[1].replace(/[0-9\._\-]+/g, " ").trim();
      if (handleUser.length > 2) {
        detectedMerchant = handleUser.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        cleanedDesc = `UPI to ${detectedMerchant}`;
        confidence = 65;
      }
    }
  }

  // Set clean description
  if (detectedMerchant) {
    cleanedDesc = detectedMerchant;
  } else {
    // Trim noisy codes
    cleanedDesc = text
      .replace(/^UPI\/[0-9]+\/[0-9:]+\/UP[I]?\//i, "UPI / ")
      .replace(/^DR:REN:[A-Za-z0-9]+:/i, "")
      .slice(0, 120)
      .trim();
  }

  // Default category if income
  if (type === "income" && category === "Other Expense") {
    category = "Other Income";
  }

  return {
    occurredAt: raw.occurredAt,
    description: cleanedDesc || "Transaction",
    merchant: detectedMerchant,
    reference,
    amount: raw.amount,
    type,
    category,
    confidence,
    balance: raw.balance,
    duplicateStatus: "new",
    selected: true,
  };
}
