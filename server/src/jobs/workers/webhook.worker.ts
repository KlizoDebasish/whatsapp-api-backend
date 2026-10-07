import { Worker, Job } from "bullmq";
import { createBullMQRedisConnection } from "../../config/redis";
import { QUEUES, WebhookJobData } from "../queue";
import { logger } from "../../utils/logger";
import { prisma } from "../../config/database";
import crypto from "crypto";

const webhookWorker = new Worker<WebhookJobData>(
  QUEUES.WEBHOOKS,
  async (job: Job<WebhookJobData>) => {
    const { webhookUrl, webhookSecret, event, timestamp, sessionId, payload } = job.data;

    const bodyString = JSON.stringify({ event, timestamp, sessionId, data: payload });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "WhatsApp-APIGateway-Webhook/2.0",
      "X-Gateway-Event": event,
      "X-Gateway-Timestamp": timestamp,
    };

    if (webhookSecret) {
      const hmac = crypto.createHmac("sha256", webhookSecret);
      hmac.update(bodyString);
      headers["X-Hub-Signature-256"] = `sha256=${hmac.digest("hex")}`;
    }

    const startTime = Date.now();
    let status = "failed";
    let responseCode = 0;
    let responseBody = "";
    let errorMessage: string | null = null;

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: bodyString,
        signal: AbortSignal.timeout(10000),
      });

      responseCode = res.status;
      responseBody = (await res.text()).substring(0, 1000);
      status = res.ok ? "success" : "failed";

      if (!res.ok) {
        errorMessage = `HTTP ${res.status}`;
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`Retryable error: ${res.status}`);
        }
      }
    } catch (err: any) {
      errorMessage = err.message || "Network Error";
      status = "failed";
      throw err; // BullMQ will retry
    } finally {
      const executionTimeMs = Date.now() - startTime;

      prisma.webhookLog
        .create({
          data: {
            webhookId: job.data.webhookId,
            eventType: event,
            payload: { event, timestamp, sessionId, data: payload } as any,
            responseCode,
            responseBody,
            status,
            errorMessage,
            executionTimeMs,
          },
        })
        .catch(() => {});
    }

    logger.info({ event, url: webhookUrl, status, responseCode }, "[WebhookWorker] Delivered");
    return { status, responseCode };
  },
  {
    connection: createBullMQRedisConnection(),
    concurrency: 5,
    limiter: { max: 20, duration: 1000 },
  }
);

webhookWorker.on("completed", (job) => {
  logger.debug(`[WebhookWorker] Job ${job.id} completed`);
});

webhookWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "[WebhookWorker] Job failed");
});

webhookWorker.on("error", (err) => {
  logger.error({ err }, "[WebhookWorker] Worker error");
});

export { webhookWorker };
