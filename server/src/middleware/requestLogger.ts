import pinoHttp from "pino-http";
import { logger } from "../utils/logger";

export const requestLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    if (res.statusCode >= 300) return "silent";
    return "info";
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (_req, res, err) => {
    return `${err.message} — ${res.statusCode}`;
  },
  // Don't log SSE streaming or health checks
  autoLogging: {
    ignore: (req) =>
      req.url?.includes("/events") || req.url?.includes("/health") || false,
  },
});
