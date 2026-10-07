import { Request, Response, NextFunction } from "express";
import { ragModuleService } from "./rag.service";

export class RagController {
  async getDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await ragModuleService.getDocuments();
      res.json({ success: true, data: docs });
    } catch (err) {
      next(err);
    }
  }

  async uploadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const filename = (req.body.filename as string) || `doc_${Date.now()}.pdf`;
      const base64Data = req.body.base64Data as string;
      const fileType = (req.body.fileType as string) || "pdf";

      if (!base64Data) {
        res.status(400).json({ success: false, error: "base64Data is required" });
        return;
      }

      const buffer = Buffer.from(base64Data, "base64");
      const result = await ragModuleService.processAndIndexDocument(filename, buffer, fileType);

      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getDocumentDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await ragModuleService.getDocumentDetails(req.params.id);
      res.json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }

  async deleteDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ragModuleService.deleteDocument(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async query(req: Request, res: Response, next: NextFunction) {
    try {
      const { query } = req.body;
      const result = await ragModuleService.executeQuery(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await ragModuleService.getStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  async regenerateEmbeddings(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ragModuleService.regenerateEmbeddings();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const ragController = new RagController();
