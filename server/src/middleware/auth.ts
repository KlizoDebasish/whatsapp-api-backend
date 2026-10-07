import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { config } from "../config";

export interface AuthContext {
  keyId: string;
  keyName: string;
  permissions: string[];
  allowedChats: string[] | "*";
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

// In-memory rate limiter per API key: Map<keyId, { count, resetTime }>
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
  options?: { requiredPermission?: string; targetChatId?: string }
): Promise<void> {
  // Allow public endpoints
  const path = req.path || "";
  if (
    path.includes("/health") ||
    path.includes("/docs") ||
    path.includes("/events") ||
    path.includes("/media")
  ) {
    return next();
  }

  const apiKey =
    (req.headers["x-api-key"] as string) ||
    (req.headers["authorization"] as string)?.replace(/^Bearer\s+/i, "") ||
    (req.query.api_key as string);

  // Internal dashboard bypass or dev mode bypass when no keys are registered
  if (!apiKey) {
    if (
      req.headers["x-dashboard-request"] === config.DASHBOARD_SECRET ||
      config.isDev
    ) {
      req.auth = {
        keyId: "dashboard_internal",
        keyName: "Dashboard Internal Session",
        permissions: ["*"],
        allowedChats: "*",
      };
      return next();
    }
    res.status(401).json({
      error: "Missing API Key. Provide 'x-api-key' or 'Authorization: Bearer <key>' header.",
    });
    return;
  }

  try {
    const keyRecord = await prisma.apiKey.findFirst({
      where: { keyHash: apiKey, isActive: true },
    });

    if (!keyRecord) {
      // In dev mode with master key match or fallback
      if (config.isDev) {
        req.auth = {
          keyId: "dev_fallback",
          keyName: "Dev Fallback Session",
          permissions: ["*"],
          allowedChats: "*",
        };
        return next();
      }
      res.status(403).json({ error: "Invalid or revoked API Key." });
      return;
    }

    // In-memory rate limiting
    const now = Date.now();
    const rateLimit = keyRecord.rateLimitPerMin;
    const currentLimit = rateLimitMap.get(keyRecord.id);

    if (!currentLimit || now > currentLimit.resetTime) {
      rateLimitMap.set(keyRecord.id, { count: 1, resetTime: now + 60000 });
    } else {
      currentLimit.count += 1;
      if (currentLimit.count > rateLimit) {
        res.status(429).json({
          error: `Rate limit exceeded. Maximum ${rateLimit} requests/min for this API key.`,
        });
        return;
      }
    }

    const permissions = keyRecord.permissions;

    // Permission check
    const requiredPermission = options?.requiredPermission;
    if (
      requiredPermission &&
      requiredPermission !== "*" &&
      !permissions.includes("*") &&
      !permissions.includes(requiredPermission)
    ) {
      res.status(403).json({
        error: `API key lacks required permission: '${requiredPermission}'. Granted: ${permissions.join(", ")}`,
      });
      return;
    }

    // Chat permission check
    let allowedChats: string[] | "*" = "*";
    const rawAllowedChats = keyRecord.allowedChats;
    if (rawAllowedChats !== '"*"' && rawAllowedChats !== "*") {
      try {
        allowedChats = JSON.parse(rawAllowedChats);
      } catch {
        allowedChats = [rawAllowedChats];
      }
    }

    const targetChatId = options?.targetChatId;
    if (targetChatId && allowedChats !== "*") {
      const formatted = targetChatId.replace(/[^0-9@a-z._-]/gi, "");
      const isAllowed = (allowedChats as string[]).some((allowed) => {
        if (allowed === "*") return true;
        if (allowed.startsWith("*@") && formatted.endsWith(allowed.substring(1))) return true;
        return formatted === allowed || formatted.includes(allowed);
      });

      if (!isAllowed) {
        res.status(403).json({
          error: `Chat permission denied for '${targetChatId}'. Allowed: ${JSON.stringify(allowedChats)}`,
        });
        return;
      }
    }

    // Update last_used_at async
    prisma.apiKey
      .update({ where: { id: keyRecord.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    req.auth = {
      keyId: keyRecord.id,
      keyName: keyRecord.name,
      permissions,
      allowedChats,
    };

    next();
  } catch (err: any) {
    logger.error({ err }, "Auth middleware error");
    res.status(500).json({ error: `Auth error: ${err.message}` });
  }
}

export const authenticateApiKey = (req: Request, res: Response, next: NextFunction) =>
  authenticate(req, res, next);

/** Factory: returns middleware requiring a specific permission */
export function requireAuth(permission?: string) {
  return (req: Request, res: Response, next: NextFunction) =>
    authenticate(req, res, next, { requiredPermission: permission });
}
