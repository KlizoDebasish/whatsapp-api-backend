import { Router } from "express";
import { apiKeysController } from "./api-keys.controller";
import { validateBody } from "../../middleware/validate";
import { createApiKeySchema } from "./api-keys.schema";

const router = Router();

router.get("/", (req, res, next) => apiKeysController.list(req, res, next));
router.post("/", validateBody(createApiKeySchema), (req, res, next) => apiKeysController.create(req, res, next));
router.delete("/:id", (req, res, next) => apiKeysController.revoke(req, res, next));

export default router;
