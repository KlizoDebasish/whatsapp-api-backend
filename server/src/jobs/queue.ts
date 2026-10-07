import { Queue, Worker, QueueEvents, Job } from "bullmq";
import { createBullMQRedisConnection } from "../config/redis";
import { logger } from "../utils/logger";

// ── Queue Names ──
export const QUEUES = {
  MESSAGES: "whatsapp:messages",
  WEBHOOKS: "whatsapp:webhooks",
  CLEANUP: "whatsapp:cleanup",
} as const;

// ── Queue Instances ──
const connection = createBullMQRedisConnection();

export const messageQueue = new Queue(QUEUES.MESSAGES, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const webhookQueue = new Queue(QUEUES.WEBHOOKS, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 1000 },
  },
});

export const cleanupQueue = new Queue(QUEUES.CLEANUP, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  },
});

// ── Job Type Definitions ──
export interface MessageJobData {
  sessionId: string;
  chatId: string;
  messageType: string;
  content: string;
  mediaUrl?: string;
  fileName?: string;
  mimetype?: string;
  reactionKey?: any;
  customDelaySeconds?: number;
  messageId: string;
}

export interface WebhookJobData {
  webhookId: string;
  webhookUrl: string;
  webhookSecret?: string;
  event: string;
  timestamp: string;
  sessionId: string;
  payload: any;
}

// ── Queue Event Logging ──
[messageQueue, webhookQueue].forEach((q) => {
  q.on("error", (err) => logger.error({ err, queue: q.name }, "BullMQ queue error"));
});

logger.info(`✅ BullMQ queues initialized: ${Object.values(QUEUES).join(", ")}`);

export { connection as bullMQConnection };
