import { Router, Request, Response } from "express";
import { prisma } from "../../config/database";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  let dbStatus = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  const isHealthy = dbStatus === "ok";

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
    },
  });
});

export default router;
