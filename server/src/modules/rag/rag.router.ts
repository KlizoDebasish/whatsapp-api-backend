import { Router } from "express";
import { ragController } from "./rag.controller";
import { validateBody } from "../../middleware/validate";
import { ragQuerySchema } from "./rag.schema";

const router = Router();

router.get("/documents", (req, res, next) => ragController.getDocuments(req, res, next));
router.post("/upload", (req, res, next) => ragController.uploadDocument(req, res, next));
router.get("/documents/:id", (req, res, next) => ragController.getDocumentDetails(req, res, next));
router.delete("/documents/:id", (req, res, next) => ragController.deleteDocument(req, res, next));
router.post("/query", validateBody(ragQuerySchema), (req, res, next) => ragController.query(req, res, next));
router.post("/regenerate-embeddings", (req, res, next) => ragController.regenerateEmbeddings(req, res, next));
router.get("/stats", (req, res, next) => ragController.getStats(req, res, next));

export default router;
