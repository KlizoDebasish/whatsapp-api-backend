import { Request, Response, NextFunction } from "express";
import { apiKeysService } from "./api-keys.service";

export class ApiKeysController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const keys = await apiKeysService.getAllApiKeys();
      res.json({ success: true, data: keys });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await apiKeysService.createApiKey(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await apiKeysService.revokeApiKey(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}

export const apiKeysController = new ApiKeysController();
