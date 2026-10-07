import rateLimit from "express-rate-limit";
import { config } from "../config";

/** Global API rate limiter (applies to all /api routes) */
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.isProd ? 300 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests, please slow down.",
    code: "GLOBAL_RATE_LIMITED",
  },
  skip: (req) => req.path === "/api/v1/health",
});

/** Stricter limiter for auth-sensitive endpoints */
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests to this endpoint.",
    code: "RATE_LIMITED",
  },
});
