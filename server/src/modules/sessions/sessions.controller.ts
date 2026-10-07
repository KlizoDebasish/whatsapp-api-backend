import { Request, Response, NextFunction } from "express";
import { sessionsService } from "./sessions.service";

export class SessionsController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const sessions = await sessionsService.getAllSessions();
      res.json({ success: true, data: sessions });
    } catch (err) {
      next(err);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await sessionsService.getSessionById(req.params.id);
      res.json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await sessionsService.createSession(req.body);
      res.status(201).json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await sessionsService.updateSession(req.params.id, req.body);
      res.json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await sessionsService.deleteSession(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async reconnect(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await sessionsService.reconnectSession(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await sessionsService.logoutSession(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}

export const sessionsController = new SessionsController();
