import { Router } from "express";
import { mediaController } from "./media.controller";

const router = Router();

router.get("/:filename", (req, res, next) => mediaController.serveMedia(req, res, next));

export default router;
