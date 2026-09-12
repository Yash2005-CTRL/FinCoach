import { BankInfo } from "./types";

const BANK_PATTERNS = [
  { name: "Bank of Baroda", pattern: /bank\s+of\s+baroda|bobworld|barb0/i },
  { name: "HDFC Bank", pattern: /hdfc\s+bank|hdfcbank/i },
  { name: "State Bank of India", pattern: /state\s+bank\s+of\s+india|\bsbi\b/i },
  { name: "ICICI Bank", pattern: /icici\s+bank|icicibank/i },
  { name: "Axis Bank", pattern: /axis\s+bank|utib0/i },
  { name: "Kotak Mahindra Bank", pattern: /kotak\s+mahindra|kotak\s+bank/i },
  { name: "Punjab National Bank", pattern: /punjab\s+national\s+bank|\bpnb\b/i },
  { name: "Canara Bank", pattern: /canara\s+bank/i },
  { name: "IDFC FIRST Bank", pattern: /idfc\s+first|idfc\s+bank/i },
  { name: "Union Bank of India", pattern: /union\s+bank\s+of\s+india/i },
  { name: "IndusInd Bank", pattern: /indusind\s+bank/i },
  { name: "Yes Bank", pattern: /yes\s+bank/i },
  { name: "Federal Bank", pattern: /federal\s+bank/i },
];

function parseDateStringToISO(str: string): string | null {
  if (!str) return null;
  const clean = str.trim().replace(/[\/\.]/g, "-");
  
  // DD-MM-YYYY
  const ddmmyyyy = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY-MM-DD
  const yyyymmdd = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyymmdd) {
    const [, y, m, d] = yyyymmdd;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

export function detectBankMetadata(text: string): BankInfo {
  let bankName: string | null = null;
  let accountNumber: string | null = null;
  let accountHolder: string | null = null;
  let accountType = "savings";
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let closingBalance: number | null = null;
  let confidence = 0;

  // 1. Detect Bank Name
  for (const item of BANK_PATTERNS) {
    if (item.pattern.test(text)) {
      bankName = item.name;
      confidence += 35;
      break;
    }
  }

  // 2. Detect Account Number
  const accNumMatch = text.match(
    /(?:account\s*number|a\/c\s*no\.?|account\s*no\.?|a\/c\s*number)[\s\:\-]+([0-9X\s]{8,24})/i
  );
  if (accNumMatch && accNumMatch[1]) {
    const cleaned = accNumMatch[1].replace(/\s+/g, "").trim();
    if (cleaned.length >= 8 && cleaned.length <= 20) {
      accountNumber = cleaned;
      confidence += 30;
    }
  }

  // 3. Detect Account Holder Name
  const holderMatch = text.match(
    /(?:account\s*name|customer\s*name|name\s*of\s*the\s*account\s*holder|account\s*holder)[\s\:\-]+([A-Za-z\s\.]{3,50})(?:\r?\n|$)/i
  );
  if (holderMatch && holderMatch[1]) {
    const cleaned = holderMatch[1].trim();
    if (cleaned.length >= 3 && !/account|details|number|statement/i.test(cleaned)) {
      accountHolder = cleaned;
      confidence += 15;
    }
  }

  // 4. Detect Account Type
  if (/current\s*account|\bCA\b/i.test(text)) {
    accountType = "current";
  } else if (/savings|\bSBA\b|\bSB\b/i.test(text)) {
    accountType = "savings";
  }

  // 5. Detect Statement Period
  const periodMatch = text.match(
    /(?:statement\s*(?:period|from)|period\s*from|for\s*the\s*period)[\s\:\-]+(\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{4})\s*(?:to|[\-])\s*(\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{4})/i
  );
  if (periodMatch) {
    periodStart = parseDateStringToISO(periodMatch[1]);
    periodEnd = parseDateStringToISO(periodMatch[2]);
    if (periodStart && periodEnd) {
      confidence += 20;
    }
  }

  // 6. Detect Closing Balance
  const closingMatch = text.match(/(?:closing\s*balance|available\s*balance|net\s*balance)[\s\:\-]+(?:INR|RS\.?|₹)?\s*([0-9,]+(?:\.\d{2})?)/i);
  if (closingMatch && closingMatch[1]) {
    const rawNum = closingMatch[1].replace(/,/g, "");
    const val = parseFloat(rawNum);
    if (!isNaN(val)) closingBalance = val;
  }

  return {
    bankName,
    accountNumber,
    accountHolder,
    accountType,
    periodStart,
    periodEnd,
    closingBalance,
    currency: "INR",
    confidence: Math.min(100, confidence),
  };
}
