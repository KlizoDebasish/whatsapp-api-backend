import { Router } from "express";
import { sessionsController } from "./sessions.controller";
import { validateBody } from "../../middleware/validate";
import { createSessionSchema, updateSessionSchema } from "./sessions.schema";

const router = Router();

router.get("/", (req, res, next) => sessionsController.getAll(req, res, next));
router.post("/", validateBody(createSessionSchema), (req, res, next) => sessionsController.create(req, res, next));
router.get("/:id", (req, res, next) => sessionsController.getOne(req, res, next));
router.put("/:id", validateBody(updateSessionSchema), (req, res, next) => sessionsController.update(req, res, next));
router.delete("/:id", (req, res, next) => sessionsController.delete(req, res, next));
router.post("/:id/reconnect", (req, res, next) => sessionsController.reconnect(req, res, next));
router.post("/:id/logout", (req, res, next) => sessionsController.logout(req, res, next));

export default router;
