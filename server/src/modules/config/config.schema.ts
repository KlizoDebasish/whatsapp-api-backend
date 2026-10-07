import { z } from "zod";

export const updateGatewayConfigSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
});

export const bulkUpdateGatewayConfigSchema = z.record(z.any());

export type UpdateGatewayConfigInput = z.infer<typeof updateGatewayConfigSchema>;
