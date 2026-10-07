import { Router } from "express";
import { messagesController } from "./messages.controller";
import { validateBody, validateQuery } from "../../middleware/validate";
import { sendMessageSchema, messageQuerySchema } from "./messages.schema";

const router = Router();

router.get("/", validateQuery(messageQuerySchema), (req, res, next) => messagesController.list(req, res, next));
router.post("/send", validateBody(sendMessageSchema), (req, res, next) => messagesController.send(req, res, next));
router.get("/chats", (req, res, next) => messagesController.getChats(req, res, next));
router.get("/:id", (req, res, next) => messagesController.getOne(req, res, next));

export default router;
