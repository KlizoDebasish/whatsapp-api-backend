// ── Ported from lib/gateway/safe-queue.ts — now uses Prisma + BullMQ persistence ──

import { prisma } from "../config/database";
import { eventBus } from "./event-bus";
import { dispatchWebhook } from "./webhook-dispatcher";
import { logger } from "../utils/logger";
import crypto from "crypto";

export interface QueueItem {
  id: string;
  sessionId: string;
  chatId: string;
  messageType: "text" | "image" | "document" | "audio" | "video" | "sticker" | "reaction";
  content: string;
  mediaBuffer?: Buffer;
  mediaUrl?: string;
  fileName?: string;
  mimetype?: string;
  reactionKey?: any;
  customDelaySeconds?: number;
  priority?: number;
  createdAt: number;
}

export interface QueueStatus {
  sessionId: string;
  queueLength: number;
  isProcessing: boolean;
  isPaused: boolean;
  currentItem?: QueueItem | null;
  pendingItems: Array<{
    id: string;
    chatId: string;
    messageType: string;
    content: string;
    createdAt: number;
  }>;
  lastSentAt?: string | null;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  antiBlastLimitPerMin: number;
  sentInLastMinute: number;
  typingSimulation: boolean;
  typingSpeedWpm: number;
}

class SafeMessageQueue {
  private static instance: SafeMessageQueue;
  private queues = new Map<string, QueueItem[]>();
  private processing = new Map<string, boolean>();
  private paused = new Map<string, boolean>();
  private currentItems = new Map<string, QueueItem | null>();
  private lastSentTime = new Map<string, number>();
  private recentDispatches = new Map<string, number[]>();

  private socketSenders = new Map<string, (item: QueueItem) => Promise<any>>();
  private presenceUpdaters = new Map<
    string,
    (chatId: string, presence: "composing" | "recording" | "paused") => Promise<void>
  >();

  private cachedConfig: Record<string, string> = {
    safety_profile: "balanced",
    min_delay_seconds: "8",
    max_delay_seconds: "18",
    typing_simulation: "true",
    typing_speed_wpm: "60",
    anti_blast_limit_per_min: "30",
  };

  private constructor() {
    this.refreshConfigCache();
    // Refresh config every 30 seconds
    setInterval(() => this.refreshConfigCache(), 30000);
  }

  private async refreshConfigCache(): Promise<void> {
    try {
      const rows = await prisma.gatewayConfig.findMany();
      for (const r of rows) {
        this.cachedConfig[r.key] = r.value;
      }
    } catch {}
  }

  public static getInstance(): SafeMessageQueue {
    if (!SafeMessageQueue.instance) {
      SafeMessageQueue.instance = new SafeMessageQueue();
    }
    return SafeMessageQueue.instance;
  }

  public registerSocketSender(
    sessionId: string,
    sender: (item: QueueItem) => Promise<any>,
    presenceUpdater?: (chatId: string, presence: "composing" | "recording" | "paused") => Promise<void>
  ): void {
    this.socketSenders.set(sessionId, sender);
    if (presenceUpdater) this.presenceUpdaters.set(sessionId, presenceUpdater);
    this.processQueue(sessionId);
  }

  public unregisterSocketSender(sessionId: string): void {
    this.socketSenders.delete(sessionId);
    this.presenceUpdaters.delete(sessionId);
    this.processing.set(sessionId, false);
  }

  public pauseQueue(sessionId: string): boolean {
    this.paused.set(sessionId, true);
    eventBus.emitGatewayEvent({
      type: "queue:updated",
      sessionId,
      data: { action: "paused", ...this.getQueueStatus(sessionId) },
    });
    return true;
  }

  public resumeQueue(sessionId: string): boolean {
    this.paused.set(sessionId, false);
    eventBus.emitGatewayEvent({
      type: "queue:updated",
      sessionId,
      data: { action: "resumed", ...this.getQueueStatus(sessionId) },
    });
    setTimeout(() => this.processQueue(sessionId), 50);
    return true;
  }

  public clearQueue(sessionId: string): number {
    const queue = this.queues.get(sessionId) || [];
    const count = queue.length;
    const ids = queue.map((q) => q.id);
    this.queues.set(sessionId, []);

    if (ids.length > 0) {
      prisma.message
        .updateMany({
          where: { id: { in: ids }, status: "queued" },
          data: { status: "failed", errorMessage: "Flushed by user" },
        })
        .catch(() => {});
    }

    this.broadcastQueueStatus(sessionId);
    return count;
  }

  public enqueueMessage(
    item: Omit<QueueItem, "id" | "createdAt"> & { id?: string }
  ): { messageId: string; queuePosition: number; estimatedDelaySec: number } {
    const messageId = item.id || `msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const queueItem: QueueItem = { ...item, id: messageId, createdAt: Date.now() };

    if (!this.queues.has(item.sessionId)) this.queues.set(item.sessionId, []);
    const sessionQueue = this.queues.get(item.sessionId)!;
    sessionQueue.push(queueItem);

    // Persist to DB
    prisma.message
      .create({
        data: {
          id: messageId,
          sessionId: item.sessionId,
          chatId: item.chatId,
          senderId: item.sessionId,
          direction: "outbound",
          messageType: item.messageType as any,
          content: item.content,
          mediaUrl: item.mediaUrl || null,
          status: "queued",
          delaySeconds: item.customDelaySeconds || 0,
        },
      })
      .catch((e) => logger.error({ e }, "[SafeQueue] DB log error"));

    const queuePosition = sessionQueue.length;
    const estimatedDelaySec = queuePosition * 4;

    eventBus.emitGatewayEvent({
      type: "message:queued",
      sessionId: item.sessionId,
      data: { messageId, chatId: item.chatId, messageType: item.messageType, queuePosition },
    });

    this.broadcastQueueStatus(item.sessionId);
    setTimeout(() => this.processQueue(item.sessionId), 50);

    return { messageId, queuePosition, estimatedDelaySec };
  }

  private cleanSlidingWindow(sessionId: string): number {
    const now = Date.now();
    const cutoff = now - 60000;
    let dispatches = this.recentDispatches.get(sessionId) || [];
    dispatches = dispatches.filter((t) => t >= cutoff);
    this.recentDispatches.set(sessionId, dispatches);
    return dispatches.length;
  }

  public getQueueStatus(sessionId: string): QueueStatus {
    const queue = this.queues.get(sessionId) || [];
    const cfg = this.cachedConfig;

    return {
      sessionId,
      queueLength: queue.length,
      isProcessing: this.processing.get(sessionId) || false,
      isPaused: this.paused.get(sessionId) || false,
      currentItem: this.currentItems.get(sessionId) || null,
      pendingItems: queue.slice(0, 10).map((q) => ({
        id: q.id,
        chatId: q.chatId,
        messageType: q.messageType,
        content: q.content,
        createdAt: q.createdAt,
      })),
      lastSentAt: this.lastSentTime.has(sessionId)
        ? new Date(this.lastSentTime.get(sessionId)!).toISOString()
        : null,
      minDelaySeconds: parseInt(cfg.min_delay_seconds || "8", 10),
      maxDelaySeconds: parseInt(cfg.max_delay_seconds || "18", 10),
      antiBlastLimitPerMin: parseInt(cfg.anti_blast_limit_per_min || "30", 10),
      sentInLastMinute: this.cleanSlidingWindow(sessionId),
      typingSimulation: cfg.typing_simulation !== "false",
      typingSpeedWpm: parseInt(cfg.typing_speed_wpm || "60", 10),
    };
  }

  public getAllQueuesStatus(): Record<string, QueueStatus> {
    const result: Record<string, QueueStatus> = {};
    for (const sessionId of this.queues.keys()) {
      result[sessionId] = this.getQueueStatus(sessionId);
    }
    return result;
  }

  private async processQueue(sessionId: string): Promise<void> {
    if (this.processing.get(sessionId)) return;
    if (this.paused.get(sessionId)) return;

    const sender = this.socketSenders.get(sessionId);
    if (!sender) return;

    const queue = this.queues.get(sessionId);
    if (!queue || queue.length === 0) {
      this.processing.set(sessionId, false);
      this.currentItems.set(sessionId, null);
      this.broadcastQueueStatus(sessionId);
      return;
    }

    this.processing.set(sessionId, true);

    while (queue.length > 0) {
      if (this.paused.get(sessionId)) break;

      const item = queue[0];
      this.currentItems.set(sessionId, item);
      this.broadcastQueueStatus(sessionId);

      await this.refreshConfigCache();
      const cfg = this.cachedConfig;

      const minDelay = Math.max(1, parseInt(cfg.min_delay_seconds || "8", 10));
      const maxDelay = Math.min(60, Math.max(minDelay, parseInt(cfg.max_delay_seconds || "18", 10)));
      const antiBlastLimit = Math.max(5, parseInt(cfg.anti_blast_limit_per_min || "30", 10));
      const typingEnabled = cfg.typing_simulation !== "false";
      const typingSpeedWpm = Math.max(20, parseInt(cfg.typing_speed_wpm || "60", 10));

      // Anti-blast sliding window
      const currentRate = this.cleanSlidingWindow(sessionId);
      if (currentRate >= antiBlastLimit) {
        logger.warn(`[Anti-Ban] Session ${sessionId} rate limit ${currentRate}/${antiBlastLimit}. Pausing 4s.`);
        eventBus.emitGatewayEvent({
          type: "queue:updated",
          sessionId,
          data: { alert: `Burst rate limit reached (${antiBlastLimit}/min). Throttling.`, ...this.getQueueStatus(sessionId) },
        });
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }

      // Calculate delay
      let calculatedDelaySeconds: number;
      if (item.customDelaySeconds && item.customDelaySeconds > 0) {
        calculatedDelaySeconds = Math.min(60, Math.max(1, item.customDelaySeconds));
      } else {
        const charsPerSec = Math.max(2, (typingSpeedWpm * 5) / 60);
        const typingTime = Math.round((item.content || "").length / charsPerSec);
        const jitter = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        calculatedDelaySeconds = Math.max(minDelay, Math.min(maxDelay, Math.max(typingTime, jitter)));
      }

      const presenceUpdater = this.presenceUpdaters.get(sessionId);

      if (typingEnabled) {
        await new Promise((r) => setTimeout(r, 400));
        const typingType = item.messageType === "audio" ? "recording" : "composing";
        if (presenceUpdater) {
          try { await presenceUpdater(item.chatId, typingType); } catch {}
        }
        eventBus.emitGatewayEvent({
          type: "message:typing",
          sessionId,
          data: { messageId: item.id, chatId: item.chatId, messageType: item.messageType, typingType, delaySeconds: calculatedDelaySeconds },
        });
        await new Promise((r) => setTimeout(r, Math.min(calculatedDelaySeconds * 1000, 60000)));
      } else {
        await new Promise((r) => setTimeout(r, calculatedDelaySeconds * 1000));
      }

      queue.shift();

      try {
        await sender(item);

        const now = Date.now();
        this.lastSentTime.set(sessionId, now);
        const dispatches = this.recentDispatches.get(sessionId) || [];
        dispatches.push(now);
        this.recentDispatches.set(sessionId, dispatches);

        if (presenceUpdater) {
          try { await presenceUpdater(item.chatId, "paused"); } catch {}
        }

        prisma.message
          .update({ where: { id: item.id }, data: { status: "sent", sentAt: new Date(), delaySeconds: calculatedDelaySeconds } })
          .catch(() => {});

        const sentDoc = {
          id: item.id, session_id: sessionId, chat_id: item.chatId, sender_id: "me",
          direction: "outbound", message_type: item.messageType, content: item.content,
          media_url: item.mediaUrl, status: "sent", delay_seconds: calculatedDelaySeconds,
          sent_at: new Date().toISOString(), created_at: new Date(item.createdAt).toISOString(),
        };

        eventBus.emitGatewayEvent({
          type: "message:sent",
          sessionId,
          data: { messageId: item.id, chatId: item.chatId, messageType: item.messageType, content: item.content, mediaUrl: item.mediaUrl, delaySeconds: calculatedDelaySeconds, message: sentDoc },
        });

        dispatchWebhook({
          event: "message.status",
          timestamp: new Date().toISOString(),
          sessionId,
          data: { messageId: item.id, chatId: item.chatId, status: "sent", delaySeconds: calculatedDelaySeconds },
        });
      } catch (err: any) {
        const errorMsg = err.message || "Failed to dispatch message";
        logger.error({ err, messageId: item.id }, "[SafeQueue] Send failed");

        prisma.message
          .update({ where: { id: item.id }, data: { status: "failed", errorMessage: errorMsg } })
          .catch(() => {});

        eventBus.emitGatewayEvent({
          type: "message:failed",
          sessionId,
          data: { messageId: item.id, chatId: item.chatId, error: errorMsg },
        });
      }

      this.currentItems.set(sessionId, null);
      this.broadcastQueueStatus(sessionId);
    }

    this.processing.set(sessionId, false);
    this.currentItems.set(sessionId, null);
    this.broadcastQueueStatus(sessionId);
  }

  private broadcastQueueStatus(sessionId: string): void {
    eventBus.emitGatewayEvent({
      type: "queue:updated",
      sessionId,
      data: this.getQueueStatus(sessionId),
    });
  }
}

export const safeQueue = SafeMessageQueue.getInstance();
