import { Router } from "express";
import { erpController } from "./erp.controller";
import { validateBody } from "../../middleware/validate";
import { queryErpSchema, createErpLeadSchema } from "./erp.schema";

const router = Router();

router.post("/query", validateBody(queryErpSchema), (req, res, next) => erpController.query(req, res, next));
router.get("/products", (req, res, next) => erpController.getProducts(req, res, next));
router.get("/leads", (req, res, next) => erpController.getLeads(req, res, next));
router.post("/leads", validateBody(createErpLeadSchema), (req, res, next) => erpController.createLead(req, res, next));
router.get("/summary", (req, res, next) => erpController.getSummary(req, res, next));

export default router;
