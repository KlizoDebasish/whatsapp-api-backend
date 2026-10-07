import { Router } from "express";
import { configController } from "./config.controller";
import { validateBody } from "../../middleware/validate";
import { updateGatewayConfigSchema, bulkUpdateGatewayConfigSchema } from "./config.schema";

const router = Router();

router.get("/", (req, res, next) => configController.get(req, res, next));
router.put("/", validateBody(updateGatewayConfigSchema), (req, res, next) => configController.update(req, res, next));
router.post("/bulk", validateBody(bulkUpdateGatewayConfigSchema), (req, res, next) => configController.updateBulk(req, res, next));

export default router;
