import { Request, Response, NextFunction } from "express";
import { mediaService } from "./media.service";

export class MediaController {
  async serveMedia(req: Request, res: Response, next: NextFunction) {
    try {
      const filename = req.params.filename;
      const media = await mediaService.getMediaByFilename(filename);

      res.setHeader("Content-Type", media.contentType || "application/octet-stream");
      res.setHeader("Content-Length", media.data.length);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(media.data);
    } catch (err) {
      next(err);
    }
  }
}

export const mediaController = new MediaController();
