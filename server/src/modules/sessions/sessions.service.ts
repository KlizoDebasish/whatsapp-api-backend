import { sessionsRepository } from "./sessions.repository";
import WhatsAppSessionManager from "../../services/session-manager";
import { CreateSessionInput, UpdateSessionInput } from "./sessions.schema";
import { NotFoundError } from "../../utils/errors";

export class SessionsService {
  async getAllSessions() {
    const dbSessions = await sessionsRepository.findAll();
    const manager = WhatsAppSessionManager.getInstance();

    return dbSessions.map((session) => {
      const liveSession = manager.getSession(session.id);
      return liveSession || session;
    });
  }

  async getSessionById(id: string) {
    const manager = WhatsAppSessionManager.getInstance();
    const liveSession = manager.getSession(id);
    if (liveSession) return liveSession;

    const dbSession = await sessionsRepository.findById(id);
    if (!dbSession) throw new NotFoundError(`Session with ID ${id} not found`);
    return dbSession;
  }

  async createSession(input: CreateSessionInput) {
    const manager = WhatsAppSessionManager.getInstance();
    const sessionId = input.id || `wa_${Date.now()}`;
    return manager.createSession(sessionId, input.name);
  }

  async updateSession(id: string, input: UpdateSessionInput) {
    const dbSession = await sessionsRepository.findById(id);
    if (!dbSession) throw new NotFoundError(`Session with ID ${id} not found`);

    return sessionsRepository.update(id, input);
  }

  async deleteSession(id: string) {
    const manager = WhatsAppSessionManager.getInstance();
    await manager.logoutSession(id);
    const dbSession = await sessionsRepository.findById(id);
    if (dbSession) {
      await sessionsRepository.delete(id);
    }
    return { success: true, message: `Session ${id} deleted` };
  }

  async reconnectSession(id: string) {
    const manager = WhatsAppSessionManager.getInstance();
    const session = await sessionsRepository.findById(id);
    if (!session) throw new NotFoundError(`Session with ID ${id} not found`);

    await manager.startSession(id, session.name);
    return { success: true, message: `Reconnection initiated for ${id}` };
  }

  async logoutSession(id: string) {
    const manager = WhatsAppSessionManager.getInstance();
    await manager.logoutSession(id);
    return { success: true, message: `Logged out session ${id}` };
  }
}

export const sessionsService = new SessionsService();
