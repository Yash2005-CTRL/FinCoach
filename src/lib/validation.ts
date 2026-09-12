import { z } from "zod";

export const transactionSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.coerce.number().finite().positive(),
  description: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  merchant: z.string().trim().max(120).optional(),
  accountId: z.string().uuid(),
  occurredAt: z.coerce.date().optional(),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  accountNumber: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(4).max(32).optional()),
  type: z.enum(["savings", "current", "cash", "wallet", "investment", "fixed_deposit", "other"]),
  institution: z.string().trim().max(100).optional(),
  balance: z.coerce.number().finite(),
  currency: z.string().length(3).default("INR"),
});

export const goalSchema = z.object({
  name: z.string().trim().min(1).max(100),
  targetAmount: z.coerce.number().finite().positive(),
  currentAmount: z.coerce.number().finite().min(0).default(0),
  targetDate: z.coerce.date(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});