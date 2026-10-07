import { prisma } from "../../config/database";
import { Message, MessageDirection, MessageStatus, MessageType, Prisma } from "@prisma/client";

export class MessagesRepository {
  async findMany(query: {
    sessionId?: string;
    chatId?: string;
    direction?: MessageDirection;
    status?: MessageStatus;
    limit: number;
    offset: number;
  }): Promise<{ items: Message[]; total: number }> {
    const where: Prisma.MessageWhereInput = {};
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.chatId) where.chatId = query.chatId;
    if (query.direction) where.direction = query.direction;
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.message.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string): Promise<Message | null> {
    return prisma.message.findUnique({
      where: { id },
    });
  }

  async create(data: {
    id?: string;
    sessionId: string;
    chatId: string;
    direction: MessageDirection;
    type: MessageType;
    content?: string;
    mediaUrl?: string;
    senderName?: string;
    status?: MessageStatus;
  }): Promise<Message> {
    return prisma.message.create({
      data: {
        id: data.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sessionId: data.sessionId,
        chatId: data.chatId,
        direction: data.direction,
        type: data.type,
        content: data.content || null,
        mediaUrl: data.mediaUrl || null,
        senderName: data.senderName || null,
        status: data.status || MessageStatus.queued,
      },
    });
  }

  async updateStatus(id: string, status: MessageStatus): Promise<Message> {
    return prisma.message.update({
      where: { id },
      data: { status },
    });
  }

  async findChats(sessionId?: string): Promise<{ chatId: string; lastMessage: Message }[]> {
    const messages = await prisma.message.findMany({
      where: sessionId ? { sessionId } : {},
      orderBy: { timestamp: "desc" },
      distinct: ["chatId"],
    });

    return messages.map((msg) => ({
      chatId: msg.chatId,
      lastMessage: msg,
    }));
  }
}

export const messagesRepository = new MessagesRepository();
