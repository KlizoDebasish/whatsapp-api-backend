import { z } from "zod";

export const createSessionSchema = z.object({
  id: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(100),
});

export const updateSessionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  autoReconnect: z.boolean().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
