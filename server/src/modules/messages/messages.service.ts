import { messagesRepository } from "./messages.repository";
import { safeQueue } from "../../services/safe-queue";
import { SendMessageInput, MessageQueryInput } from "./messages.schema";
import { NotFoundError } from "../../utils/errors";
import { MessageDirection, MessageType } from "@prisma/client";

export class MessagesService {
  async getMessages(query: MessageQueryInput) {
    return messagesRepository.findMany({
      sessionId: query.sessionId,
      chatId: query.chatId,
      direction: query.direction as MessageDirection,
      status: query.status as any,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getMessageById(id: string) {
    const msg = await messagesRepository.findById(id);
    if (!msg) throw new NotFoundError(`Message with ID ${id} not found`);
    return msg;
  }

  async sendMessage(input: SendMessageInput) {
    // 1. Create DB record in queued status
    const messageRecord = await messagesRepository.create({
      sessionId: input.sessionId,
      chatId: input.chatId,
      direction: MessageDirection.outbound,
      type: (input.type.toLowerCase() as MessageType) || MessageType.text,
      content: input.content || input.caption || "",
      mediaUrl: input.mediaUrl,
    });

    // 2. Queue for asynchronous sending via safeQueue / BullMQ
    await safeQueue.enqueueMessage({
      messageId: messageRecord.id,
      sessionId: input.sessionId,
      chatId: input.chatId,
      type: input.type,
      content: input.content,
      mediaUrl: input.mediaUrl,
      caption: input.caption,
      replyToMessageId: input.replyToMessageId,
      simulatedDelayMs: input.simulatedDelayMs,
    });

    return messageRecord;
  }

  async getChats(sessionId?: string) {
    return messagesRepository.findChats(sessionId);
  }
}

export const messagesService = new MessagesService();
