import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  role: z.enum(["admin", "user", "read_only"]).default("user"),
  expiresAt: z.string().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
