import express, { Express } from "express";
import { configureSecurityMiddleware } from "./middleware/security";
import { requestLogger } from "./middleware/requestLogger";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { authenticateApiKey } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import v1Router from "./routes/v1.router";

export function createApp(): Express {
  const app: Express = express();

  // Basic parsing
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Security headers & CORS
  configureSecurityMiddleware(app);

  // Logging & rate limiting
  app.use(requestLogger);
  app.use(globalRateLimiter);

  // API Key Authentication Middleware (skips /health, /docs, /events, /media)
  app.use(authenticateApiKey);

  // Mount primary API v1 router
  app.use("/api/v1", v1Router);

  // Root fallback
  app.get("/", (_req, res) => {
    res.json({
      name: "WhatsApp API Gateway Server",
      status: "online",
      documentation: "/api/v1/docs",
      health: "/api/v1/health",
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
