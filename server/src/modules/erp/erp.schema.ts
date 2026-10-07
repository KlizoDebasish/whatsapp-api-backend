import { z } from "zod";

export const queryErpSchema = z.object({
  query: z.string().min(1, "Query is required"),
  sessionId: z.string().default("wa_primary_01"),
  chatId: z.string().optional(),
  voiceUrl: z.string().optional(),
});

export const createErpLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  status: z.string().default("new"),
  source: z.string().default("whatsapp"),
  requirements: z.string().optional(),
});

export type QueryErpInput = z.infer<typeof queryErpSchema>;
export type CreateErpLeadInput = z.infer<typeof createErpLeadSchema>;
