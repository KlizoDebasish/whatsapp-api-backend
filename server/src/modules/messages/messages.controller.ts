import { Request, Response, NextFunction } from "express";
import { messagesService } from "./messages.service";
import { MessageQueryInput } from "./messages.schema";

export class MessagesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as MessageQueryInput;
      const result = await messagesService.getMessages(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const msg = await messagesService.getMessageById(req.params.id);
      res.json({ success: true, data: msg });
    } catch (err) {
      next(err);
    }
  }

  async send(req: Request, res: Response, next: NextFunction) {
    try {
      const msg = await messagesService.sendMessage(req.body);
      res.status(201).json({ success: true, data: msg });
    } catch (err) {
      next(err);
    }
  }

  async getChats(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      const chats = await messagesService.getChats(sessionId);
      res.json({ success: true, data: chats });
    } catch (err) {
      next(err);
    }
  }
}

export const messagesController = new MessagesController();
