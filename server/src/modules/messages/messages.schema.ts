import { z } from "zod";

export const sendMessageSchema = z.object({
  sessionId: z.string().default("wa_primary_01"),
  chatId: z.string().min(1, "chatId is required"),
  type: z.enum(["text", "image", "document", "audio", "video", "sticker", "reaction"]).default("text"),
  content: z.string().optional(),
  mediaUrl: z.string().optional(),
  caption: z.string().optional(),
  replyToMessageId: z.string().optional(),
  simulatedDelayMs: z.number().optional(),
});

export const messageQuerySchema = z.object({
  sessionId: z.string().optional(),
  chatId: z.string().optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  status: z.enum(["queued", "sent", "delivered", "read", "failed"]).optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MessageQueryInput = z.infer<typeof messageQuerySchema>;
