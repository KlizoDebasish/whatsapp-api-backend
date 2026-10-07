import { prisma } from "../../config/database";
import { Session, SessionStatus } from "@prisma/client";

export class SessionsRepository {
  async findAll(): Promise<Session[]> {
    return prisma.session.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({
      where: { id },
    });
  }

  async create(data: { id?: string; name: string }): Promise<Session> {
    const sessionId = data.id || `sess_${Date.now()}`;
    return prisma.session.create({
      data: {
        id: sessionId,
        name: data.name,
        status: SessionStatus.disconnected,
        autoReconnect: true,
      },
    });
  }

  async update(id: string, data: Partial<Session>): Promise<Session> {
    return prisma.session.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Session> {
    return prisma.session.delete({
      where: { id },
    });
  }
}

export const sessionsRepository = new SessionsRepository();
