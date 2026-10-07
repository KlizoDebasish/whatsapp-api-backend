// ── Ported from lib/gateway/webhook-dispatcher.ts — now uses Prisma ──

import { prisma } from "../config/database";
import { eventBus } from "./event-bus";
import crypto from "crypto";
import { logger } from "../utils/logger";

export interface WebhookEventPayload {
  event: string;
  timestamp: string;
  sessionId: string;
  data: any;
}

// In-memory per-URL queue to pace delivery and prevent 429s
const urlQueues = new Map<string, Array<{ webhook: any; payload: WebhookEventPayload }>>();
const urlProcessing = new Map<string, boolean>();

export async function dispatchWebhook(payload: WebhookEventPayload): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { isActive: true },
    });

    if (!webhooks.length) return;

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = webhooks.filter((wh) => {
      const norm = wh.url.trim().toLowerCase();
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });

    for (const webhook of unique) {
      const events = webhook.events || ["*"];
      if (!events.includes("*") && !events.includes(payload.event)) continue;

      const url = webhook.url.trim();
      if (!urlQueues.has(url)) urlQueues.set(url, []);
      urlQueues.get(url)!.push({ webhook, payload });
      processUrlQueue(url);
    }
  } catch (err) {
    logger.error({ err }, "[WebhookDispatcher] Load error");
  }
}

async function processUrlQueue(url: string): Promise<void> {
  if (urlProcessing.get(url)) return;
  const queue = urlQueues.get(url);
  if (!queue || queue.length === 0) return;

  urlProcessing.set(url, true);
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    try {
      await deliverWithRetry(item.webhook, item.payload);
    } catch (err) {
      logger.error({ err, url }, "[WebhookDispatcher] Delivery error");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  urlProcessing.set(url, false);
}

async function deliverWithRetry(
  webhook: any,
  payload: WebhookEventPayload,
  maxRetries = 2
): Promise<void> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    attempt++;
    const result = await executeDelivery(webhook, payload);
    if (result.status === "success" || (result.responseCode !== 429 && result.responseCode < 500)) {
      return;
    }
    if (attempt <= maxRetries) {
      const backoffMs = attempt * 1000;
      logger.warn(`[WebhookDispatcher] 429/5xx from ${webhook.url}, retry in ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

async function executeDelivery(
  webhook: any,
  payload: WebhookEventPayload
): Promise<{ status: string; responseCode: number; errorMessage: string | null }> {
  const startTime = Date.now();
  const bodyString = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "WhatsApp-APIGateway-Webhook/2.0",
    "X-Gateway-Event": payload.event,
    "X-Gateway-Timestamp": payload.timestamp,
  };

  if (webhook.secret) {
    const hmac = crypto.createHmac("sha256", webhook.secret);
    hmac.update(bodyString);
    headers["X-Hub-Signature-256"] = `sha256=${hmac.digest("hex")}`;
  }

  let status = "failed";
  let responseCode = 0;
  let responseBody = "";
  let errorMessage: string | null = null;

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: bodyString,
      signal: AbortSignal.timeout(10000),
    });

    responseCode = res.status;
    responseBody = (await res.text()).substring(0, 1000);
    status = res.ok ? "success" : "failed";
    if (!res.ok) {
      errorMessage = `HTTP ${res.status}: ${res.statusText}`;
    }
  } catch (err: any) {
    errorMessage = err.message || "Network Error / Timeout";
    status = "failed";
  }

  const executionTimeMs = Date.now() - startTime;

  // Log to DB async
  prisma.webhookLog
    .create({
      data: {
        webhookId: webhook.id,
        eventType: payload.event,
        payload: payload as any,
        responseCode,
        responseBody,
        status,
        errorMessage,
        executionTimeMs,
      },
    })
    .catch((e) => logger.error({ e }, "[WebhookLog] DB write error"));

  eventBus.emitGatewayEvent({
    type: "webhook:dispatched",
    sessionId: payload.sessionId,
    data: {
      webhookId: webhook.id,
      webhookName: webhook.name,
      url: webhook.url,
      event: payload.event,
      status,
      responseCode,
      executionTimeMs,
    },
  });

  return { status, responseCode, errorMessage };
}
