import { z } from "zod";

export const createWebhookConfigSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  events: z.array(z.string()).min(1, "At least one event is required"),
  secret: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const updateWebhookConfigSchema = createWebhookConfigSchema.partial();

export type CreateWebhookConfigInput = z.infer<typeof createWebhookConfigSchema>;
export type UpdateWebhookConfigInput = z.infer<typeof updateWebhookConfigSchema>;
