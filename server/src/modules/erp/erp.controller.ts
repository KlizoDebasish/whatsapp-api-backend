import { Request, Response, NextFunction } from "express";
import { erpService } from "./erp.service";

export class ErpController {
  async query(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await erpService.processQuery(req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const products = await erpService.getProducts();
      res.json({ success: true, data: products });
    } catch (err) {
      next(err);
    }
  }

  async getLeads(req: Request, res: Response, next: NextFunction) {
    try {
      const leads = await erpService.getLeads();
      res.json({ success: true, data: leads });
    } catch (err) {
      next(err);
    }
  }

  async createLead(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await erpService.createLead(req.body);
      res.status(201).json({ success: true, data: lead });
    } catch (err) {
      next(err);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await erpService.getInventorySummary();
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  }
}

export const erpController = new ErpController();
