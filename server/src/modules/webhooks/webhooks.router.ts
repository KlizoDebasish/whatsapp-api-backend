import { Router } from "express";
import { webhooksController } from "./webhooks.controller";
import { validateBody } from "../../middleware/validate";
import { createWebhookConfigSchema, updateWebhookConfigSchema } from "./webhooks.schema";

const router = Router();

router.get("/configs", (req, res, next) => webhooksController.listConfigs(req, res, next));
router.post("/configs", validateBody(createWebhookConfigSchema), (req, res, next) => webhooksController.createConfig(req, res, next));
router.put("/configs/:id", validateBody(updateWebhookConfigSchema), (req, res, next) => webhooksController.updateConfig(req, res, next));
router.delete("/configs/:id", (req, res, next) => webhooksController.deleteConfig(req, res, next));
router.post("/configs/:id/test", (req, res, next) => webhooksController.testWebhook(req, res, next));
router.get("/logs", (req, res, next) => webhooksController.getLogs(req, res, next));

export default router;
