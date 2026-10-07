import { Request, Response, NextFunction } from "express";
import { configService } from "./config.service";

export class ConfigController {
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await configService.getConfig();
      res.json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { key, value } = req.body;
      const updated = await configService.updateConfig(key, value);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  async updateBulk(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await configService.updateBulkConfig(req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
}

export const configController = new ConfigController();
