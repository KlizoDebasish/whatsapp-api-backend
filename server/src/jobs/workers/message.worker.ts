import { Worker, Job } from "bullmq";
import { createBullMQRedisConnection } from "../../config/redis";
import { QUEUES, MessageJobData } from "../queue";
import { safeQueue } from "../../services/safe-queue";
import { logger } from "../../utils/logger";

/**
 * BullMQ Message Worker
 * 
 * Handles durable message persistence — when a message arrives via BullMQ
 * (e.g. after a server restart), it re-enqueues it into the in-memory safeQueue
 * which handles the actual anti-ban pacing and Baileys socket sending.
 */
const messageWorker = new Worker<MessageJobData>(
  QUEUES.MESSAGES,
  async (job: Job<MessageJobData>) => {
    const { sessionId, chatId, messageType, content, mediaUrl, fileName, mimetype, reactionKey, customDelaySeconds, messageId } = job.data;

    logger.info({ messageId, sessionId, chatId, messageType }, "[MessageWorker] Processing job");

    safeQueue.enqueueMessage({
      id: messageId,
      sessionId,
      chatId,
      messageType: messageType as any,
      content,
      mediaUrl,
      fileName,
      mimetype,
      reactionKey,
      customDelaySeconds,
    });

    return { messageId, enqueued: true };
  },
  {
    connection: createBullMQRedisConnection(),
    concurrency: 1, // Process one at a time to maintain ordering
  }
);

messageWorker.on("completed", (job) => {
  logger.debug(`[MessageWorker] Job ${job.id} completed`);
});

messageWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "[MessageWorker] Job failed");
});

messageWorker.on("error", (err) => {
  logger.error({ err }, "[MessageWorker] Worker error");
});

export { messageWorker };
