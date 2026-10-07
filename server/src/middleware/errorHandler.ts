import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { config } from "../config";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = "Internal Server Error";
  let code = "INTERNAL_ERROR";

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code || "APP_ERROR";

    if (err.isOperational) {
      logger.warn({ code, statusCode, path: req.path, message }, "Operational error");
    } else {
      logger.error({ err, path: req.path }, "Non-operational AppError");
    }
  } else {
    // Unexpected error
    logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    code,
    ...(config.isDev && !(err instanceof AppError) ? { stack: err.stack } : {}),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route '${req.method} ${req.path}' not found`,
    code: "NOT_FOUND",
  });
}
