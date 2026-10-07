import { Request, Response, NextFunction } from "express";
import { webhooksService } from "./webhooks.service";

export class WebhooksController {
  async listConfigs(req: Request, res: Response, next: NextFunction) {
    try {
      const configs = await webhooksService.getAllConfigs();
      res.json({ success: true, data: configs });
    } catch (err) {
      next(err);
    }
  }

  async createConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await webhooksService.createConfig(req.body);
      res.status(201).json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  }

  async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await webhooksService.updateConfig(req.params.id, req.body);
      res.json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  }

  async deleteConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await webhooksService.deleteConfig(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async testWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await webhooksService.testWebhook(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async getLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const logs = await webhooksService.getLogs(limit);
      res.json({ success: true, data: logs });
    } catch (err) {
      next(err);
    }
  }
}

export const webhooksController = new WebhooksController();
