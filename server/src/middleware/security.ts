import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { config } from "../config";
import { Express } from "express";

export function applySecurityMiddleware(app: Express): void {
  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Let frontend handle CSP
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.allowedOrigins.includes(origin) || config.isDev) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked for origin: ${origin}`));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-api-key",
        "x-dashboard-request",
        "Cache-Control",
      ],
      exposedHeaders: ["X-Request-Id"],
    })
  );

  // Response compression
  app.use(compression());
}

export const configureSecurityMiddleware = applySecurityMiddleware;
