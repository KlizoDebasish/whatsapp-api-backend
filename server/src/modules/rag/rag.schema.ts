import { z } from "zod";

export const ragQuerySchema = z.object({
  query: z.string().min(1, "Query is required"),
  topK: z.number().min(1).max(10).optional().default(4),
});

export type RagQueryInput = z.infer<typeof ragQuerySchema>;
