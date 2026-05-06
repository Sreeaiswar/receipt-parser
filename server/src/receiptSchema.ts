import { z } from "zod";

export const receiptSchema = z.object({
  // Allow empty values so the UI can still render and the user can correct.
  merchant: z.string().trim().min(0).default(""),
  date: z.string().trim().min(0).default(""),
  lineItems: z
    .array(
      z.object({
        name: z.string().trim().min(0).default(""),
        amount: z.number().default(0),
      })
    )
    .default([]),
  total: z.number().default(0),
});

export const saveReceiptRequestSchema = z.object({
  merchant: z.string().trim().min(0),
  date: z.string().trim().min(0),
  lineItems: z.array(
    z.object({
      name: z.string().trim().min(1),
      amount: z.coerce.number(),
    })
  ),
  total: z.coerce.number(),
});
