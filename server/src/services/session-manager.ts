// ── Ported from lib/gateway/session-manager.ts — now uses Prisma ──

import makeWASocket, {
  DisconnectReason,
  WASocket,
  proto,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import path from "path";
import { prisma } from "../config/database";
import { usePostgresAuthState, clearPostgresAuthState } from "./auth-state";
import { eventBus } from "./event-bus";
import { dispatchWebhook } from "./webhook-dispatcher";
import { processVoiceOrTextQuery } from "./ai-erp-engine";
import { logger } from "../utils/logger";
import { SessionStatus } from "@prisma/client";

export interface SessionInfo {
  id: string;
  name: string;
  phoneNumber?: string | null;
  status: "disconnected" | "connecting" | "qr_ready" | "connected" | "logged_out";
  qrCode?: string | null;
  qrDataUrl?: string | null;
  reconnectAttempts: number;
  autoReconnect: boolean;
  createdAt: string;
  lastConnectedAt?: string | null;
}

export function formatWhatsAppJid(chatId: string): string {
  let clean = (chatId || "").trim();
  if (
    clean.endsWith("@g.us") ||
    clean.endsWith("@s.whatsapp.net") ||
    clean.endsWith("@lid")
  ) {
    return clean;
  }
  if (clean.endsWith("@c.us")) {
    return clean.replace("@c.us", "@s.whatsapp.net");
  }
  if (clean.includes("-") || (clean.length >= 18 && clean.startsWith("120363"))) {
    return `${clean.replace(/[^0-9-]/g, "")}@g.us`;
  }
  const digits = clean.replace(/[^0-9]/g, "");
  return `${digits}@s.whatsapp.net`;
}

type SocketSender = (item: any) => Promise<any>;
type PresenceUpdater = (chatId: string, presence: "composing" | "recording" | "paused") => Promise<void>;

class WhatsAppSessionManager {
  private static instance: WhatsAppSessionManager;
  private sockets = new Map<string, WASocket>();
  private qrCodes = new Map<string, { raw: string; dataUrl: string }>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private sessionCache = new Map<string, any>();
  private socketSenders = new Map<string, SocketSender>();
  private presenceUpdaters = new Map<string, PresenceUpdater>();
  private initialized = false;

  // Dedup sets
  private processedInboundMessageIds = new Set<string>();
  private repliedMessageIds = new Set<string>();
  private sentBotMessageIds = new Set<string>();

  private constructor() {}

  public static getInstance(): WhatsAppSessionManager {
    if (!WhatsAppSessionManager.instance) {
      WhatsAppSessionManager.instance = new WhatsAppSessionManager();
    }
    return WhatsAppSessionManager.instance;
  }

  public registerSocketSender(
    sessionId: string,
    sender: SocketSender,
    presenceUpdater?: PresenceUpdater
  ): void {
    this.socketSenders.set(sessionId, sender);
    if (presenceUpdater) this.presenceUpdaters.set(sessionId, presenceUpdater);
  }

  public unregisterSocketSender(sessionId: string): void {
    this.socketSenders.delete(sessionId);
    this.presenceUpdaters.delete(sessionId);
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const savedSessions = await prisma.session.findMany({
        where: { autoReconnect: true },
      });

      for (const session of savedSessions) {
        this.sessionCache.set(session.id, session);
      }

      if (savedSessions.length === 0) {
        logger.info("[SessionManager] Creating initial primary WhatsApp session...");
        this.createSession("wa_primary_01", "Primary WhatsApp").catch(() => {});
      } else {
        for (const session of savedSessions) {
          if (session.status !== SessionStatus.logged_out) {
            logger.info(`[SessionManager] Restoring session: ${session.id}`);
            this.startSession(session.id, session.name).catch((err) =>
              logger.error({ err }, `[SessionManager] Error restoring ${session.id}`)
            );
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "[SessionManager] Initialization error");
    }
  }

  public async createSession(id: string, name: string): Promise<SessionInfo> {
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");

    try {
      await prisma.session.upsert({
        where: { id: cleanId },
        update: { name, status: SessionStatus.connecting },
        create: {
          id: cleanId,
          name,
          status: SessionStatus.connecting,
          autoReconnect: true,
          reconnectAttempts: 0,
        },
      });

      this.sessionCache.set(cleanId, {
        id: cleanId,
        name,
        status: "connecting",
        autoReconnect: true,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      logger.error({ e }, "[SessionManager] Create session DB error");
    }

    await this.startSession(cleanId, name);
    return this.getSession(cleanId)!;
  }

  public async startSession(sessionId: string, sessionName: string): Promise<void> {
    if (this.reconnectTimers.has(sessionId)) {
      clearTimeout(this.reconnectTimers.get(sessionId)!);
      this.reconnectTimers.delete(sessionId);
    }

    const existingSock = this.sockets.get(sessionId);
    if (existingSock) {
      try {
        existingSock.ev.removeAllListeners();
        existingSock.end(undefined);
      } catch {}
      this.sockets.delete(sessionId);
    }

    const { state, saveCreds } = await usePostgresAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();
    const baileysLogger = pino({ level: "silent" });

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: baileysLogger,
      browser: ["WhatsApp Gateway ERP", "Chrome", "125.0.0.0"],
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    this.sockets.set(sessionId, sock);

    this.registerSocketSender(
      sessionId,
      async (item: any) => this.executeSendSocketMessage(sock, item),
      async (chatId: string, presence: any) => this.executePresenceUpdate(sock, chatId, presence)
    );

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          this.qrCodes.set(sessionId, { raw: qr, dataUrl: qrDataUrl });

          await prisma.session.update({
            where: { id: sessionId },
            data: { status: SessionStatus.qr_ready, qrCode: qr },
          });

          if (this.sessionCache.has(sessionId)) {
            const cached = this.sessionCache.get(sessionId);
            cached.status = "qr_ready";
            cached.qrCode = qr;
          }

          eventBus.emitGatewayEvent({
            type: "session:qr",
            sessionId,
            data: { qrRaw: qr, qrDataUrl },
          });
        } catch (e) {
          logger.error({ e }, `[QR Error] ${sessionId}`);
        }
      }

      if (connection === "connecting") {
        prisma.session
          .update({ where: { id: sessionId }, data: { status: SessionStatus.connecting } })
          .catch(() => {});
        if (this.sessionCache.has(sessionId)) {
          this.sessionCache.get(sessionId).status = "connecting";
        }
        eventBus.emitGatewayEvent({ type: "session:status", sessionId, data: { status: "connecting" } });
      }

      if (connection === "open") {
        const jid = sock.user?.id || "";
        const phoneNumber = jid.split(":")[0]?.split("@")[0] || "";
        this.qrCodes.delete(sessionId);

        prisma.session
          .update({
            where: { id: sessionId },
            data: {
              status: SessionStatus.connected,
              phoneNumber,
              qrCode: null,
              reconnectAttempts: 0,
              lastConnectedAt: new Date(),
            },
          })
          .catch(() => {});

        if (this.sessionCache.has(sessionId)) {
          const cached = this.sessionCache.get(sessionId);
          cached.status = "connected";
          cached.phoneNumber = phoneNumber;
          cached.qrCode = null;
        }

        eventBus.emitGatewayEvent({
          type: "session:connected",
          sessionId,
          data: { status: "connected", phoneNumber, jid },
        });

        dispatchWebhook({
          event: "session.status",
          timestamp: new Date().toISOString(),
          sessionId,
          data: { status: "connected", phoneNumber },
        });
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.info(`[Session ${sessionId}] Closed. Code: ${statusCode}, Reconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          prisma.session
            .update({ where: { id: sessionId }, data: { status: SessionStatus.logged_out, qrCode: null } })
            .catch(() => {});

          if (this.sessionCache.has(sessionId)) {
            this.sessionCache.get(sessionId).status = "logged_out";
          }

          this.unregisterSocketSender(sessionId);
          this.sockets.delete(sessionId);
          this.qrCodes.delete(sessionId);

          eventBus.emitGatewayEvent({
            type: "session:disconnected",
            sessionId,
            data: { status: "logged_out", reason: "logged_out" },
          });

          dispatchWebhook({
            event: "session.status",
            timestamp: new Date().toISOString(),
            sessionId,
            data: { status: "logged_out" },
          });
        } else if (shouldReconnect) {
          prisma.session
            .update({ where: { id: sessionId }, data: { status: SessionStatus.disconnected } })
            .catch(() => {});

          if (this.sessionCache.has(sessionId)) {
            this.sessionCache.get(sessionId).status = "disconnected";
          }

          eventBus.emitGatewayEvent({
            type: "session:status",
            sessionId,
            data: { status: "disconnected", reason: "reconnecting" },
          });

          const timer = setTimeout(() => {
            this.startSession(sessionId, sessionName);
          }, 5000);
          this.reconnectTimers.set(sessionId, timer);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (!msg.message || !msg.key) continue;
        const msgId = msg.key.id || "";
        if (
          msgId.startsWith("reply_") ||
          msgId.startsWith("msg_") ||
          this.sentBotMessageIds.has(msgId)
        ) continue;
        await this.handleIncomingMessage(sessionId, sock, msg);
      }
    });
  }

  private async handleIncomingMessage(
    sessionId: string,
    sock: WASocket,
    msg: proto.IWebMessageInfo
  ): Promise<void> {
    if (!msg.key) return;
    const messageId = msg.key.id || `msg_in_${Date.now()}`;

    if (this.processedInboundMessageIds.has(messageId)) return;
    this.processedInboundMessageIds.add(messageId);
    if (this.processedInboundMessageIds.size > 3000) this.processedInboundMessageIds.clear();

    const senderJid = msg.key.remoteJid || "";
    if (
      !senderJid ||
      senderJid === "status@broadcast" ||
      senderJid.endsWith("@broadcast") ||
      senderJid.endsWith("@newsletter")
    ) return;

    let rawMsg: any = msg.message;
    if (rawMsg?.ephemeralMessage?.message) rawMsg = rawMsg.ephemeralMessage.message;
    if (rawMsg?.viewOnceMessage?.message) rawMsg = rawMsg.viewOnceMessage.message;
    if (rawMsg?.viewOnceMessageV2?.message) rawMsg = rawMsg.viewOnceMessageV2.message;
    if (rawMsg?.documentWithCaptionMessage?.message) rawMsg = rawMsg.documentWithCaptionMessage.message;
    if (rawMsg?.protocolMessage || rawMsg?.pollUpdateMessage) return;

    let messageType: "text" | "image" | "document" | "audio" | "video" | "sticker" | "reaction" = "text";
    let content = "";
    let mediaUrl: string | null = null;
    let audioBuffer: Buffer | null = null;
    let imageBuffer: Buffer | null = null;

    if (rawMsg?.conversation) {
      content = rawMsg.conversation;
    } else if (rawMsg?.extendedTextMessage?.text) {
      content = rawMsg.extendedTextMessage.text;
    } else if (rawMsg?.imageMessage) {
      messageType = "image";
      content = rawMsg.imageMessage.caption || "[Image]";
      try {
        const stream = await downloadMediaMessage(msg as any, "buffer", {});
        const buf = stream as Buffer;
        imageBuffer = buf;
        const filename = `in_img_${messageId}_${Date.now()}.jpg`;
        await prisma.mediaFile.upsert({
          where: { filename },
          update: { data: buf, contentType: "image/jpeg", size: buf.length },
          create: { filename, data: buf, contentType: "image/jpeg", size: buf.length },
        });
        mediaUrl = `/api/v1/media/${filename}`;
      } catch {}
    } else if (rawMsg?.audioMessage) {
      messageType = "audio";
      content = "[Voice Note / Audio]";
      try {
        const stream = await downloadMediaMessage(msg as any, "buffer", {});
        audioBuffer = stream as Buffer;
        const filename = `in_aud_${messageId}_${Date.now()}.ogg`;
        await prisma.mediaFile.upsert({
          where: { filename },
          update: { data: audioBuffer, contentType: "audio/ogg", size: audioBuffer.length },
          create: { filename, data: audioBuffer, contentType: "audio/ogg", size: audioBuffer.length },
        });
        mediaUrl = `/api/v1/media/${filename}`;
      } catch {}
    } else if (rawMsg?.videoMessage) {
      messageType = "video";
      content = rawMsg.videoMessage.caption || "[Video]";
      try {
        const stream = await downloadMediaMessage(msg as any, "buffer", {});
        const buf = stream as Buffer;
        const filename = `in_vid_${messageId}_${Date.now()}.mp4`;
        await prisma.mediaFile.upsert({
          where: { filename },
          update: { data: buf, contentType: "video/mp4", size: buf.length },
          create: { filename, data: buf, contentType: "video/mp4", size: buf.length },
        });
        mediaUrl = `/api/v1/media/${filename}`;
      } catch {}
    } else if (rawMsg?.documentMessage) {
      messageType = "document";
      const docName = rawMsg.documentMessage.fileName || "Document";
      content = docName;
      try {
        const stream = await downloadMediaMessage(msg as any, "buffer", {});
        const buf = stream as Buffer;
        const ext = path.extname(docName) || ".pdf";
        const filename = `in_doc_${messageId}_${Date.now()}${ext}`;
        await prisma.mediaFile.upsert({
          where: { filename },
          update: { data: buf, contentType: "application/octet-stream", size: buf.length },
          create: { filename, data: buf, contentType: "application/octet-stream", size: buf.length },
        });
        mediaUrl = `/api/v1/media/${filename}`;
      } catch {}
    } else if (rawMsg?.stickerMessage) {
      messageType = "sticker";
      content = "[Sticker]";
    } else if (rawMsg?.reactionMessage) {
      messageType = "reaction";
      content = rawMsg.reactionMessage.text || "";
    } else if (rawMsg?.buttonsResponseMessage?.selectedDisplayText) {
      content = rawMsg.buttonsResponseMessage.selectedDisplayText;
    } else if (rawMsg?.listResponseMessage?.title) {
      content = rawMsg.listResponseMessage.title;
    }

    if (!content && messageType === "text") content = "Hello";

    const isFromMe = !!msg.key.fromMe;
    const direction = isFromMe ? "outbound" : "inbound";
    const status = isFromMe ? "sent" : "delivered";

    prisma.message
      .create({
        data: {
          id: messageId,
          sessionId,
          chatId: senderJid,
          senderId: msg.key?.participant || senderJid,
          direction: direction as any,
          messageType: messageType as any,
          content,
          mediaUrl,
          status: status as any,
        },
      })
      .catch((e) => logger.error({ e }, "[Message Log Error]"));

    const messageDoc = {
      id: messageId,
      session_id: sessionId,
      chat_id: senderJid,
      sender_id: msg.key?.participant || senderJid,
      direction,
      message_type: messageType,
      content,
      media_url: mediaUrl,
      status,
      created_at: new Date().toISOString(),
    };

    eventBus.emitGatewayEvent({
      type: isFromMe ? "message:sent" : "message:received",
      sessionId,
      data: { messageId, senderJid, chatId: senderJid, messageType, content, mediaUrl, message: messageDoc },
    });

    const msgTimestamp = Number(msg.messageTimestamp) || 0;
    const isOldMessage = msgTimestamp > 0 && msgTimestamp < Math.floor(Date.now() / 1000) - 90;
    const alreadyReplied = this.repliedMessageIds.has(messageId);

    if (!isFromMe) {
      dispatchWebhook({
        event: "message.received",
        timestamp: new Date().toISOString(),
        sessionId,
        data: {
          messageId,
          from: senderJid,
          participant: msg.key?.participant,
          messageType,
          content,
          pushName: msg.pushName,
        },
      });

      if (!alreadyReplied && !isOldMessage && messageType !== "reaction") {
        this.repliedMessageIds.add(messageId);
        if (this.repliedMessageIds.size > 3000) this.repliedMessageIds.clear();

        let isAutoReplyEnabled = true;
        try {
          const cfg = await prisma.gatewayConfig.findUnique({ where: { key: "ai_auto_reply" } });
          if (cfg) isAutoReplyEnabled = cfg.value !== "false";
        } catch {}

        if (!isAutoReplyEnabled) return;

        try {
          const aiResult = await processVoiceOrTextQuery(
            {
              text: content && content !== "[Image]" ? content : undefined,
              imageBase64: imageBuffer ? imageBuffer.toString("base64") : undefined,
              imageMimeType: messageType === "sticker" ? "image/webp" : "image/jpeg",
              imageUrl: mediaUrl || undefined,
              audioBase64: audioBuffer ? audioBuffer.toString("base64") : undefined,
              audioMimeType: rawMsg?.audioMessage?.mimetype || "audio/ogg",
              pushName: msg.pushName || undefined,
            },
            sessionId,
            senderJid
          );

          if (aiResult?.response) {
            const replyId = `reply_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const jid = formatWhatsAppJid(senderJid);

            let typingEnabled = true;
            let minDelay = 1;
            try {
              const [typingRow, minDelayRow] = await Promise.all([
                prisma.gatewayConfig.findUnique({ where: { key: "typing_simulation" } }),
                prisma.gatewayConfig.findUnique({ where: { key: "min_delay_seconds" } }),
              ]);
              if (typingRow) typingEnabled = typingRow.value !== "false";
              if (minDelayRow) minDelay = Math.max(1, parseInt(minDelayRow.value || "1", 10));
            } catch {}

            const typingDelayMs = typingEnabled ? Math.min(3500, Math.max(800, minDelay * 1000)) : 300;

            await sock.sendPresenceUpdate("composing", jid).catch(() => {});
            await new Promise((r) => setTimeout(r, typingDelayMs));

            const isImageMsg =
              aiResult.messageType === "image" ||
              !!aiResult.generatedImageUrl ||
              !!aiResult.generatedImageBuffer;

            let sendResult: any;
            if (isImageMsg) {
              const imgSource =
                aiResult.generatedImageBuffer ||
                (aiResult.generatedImageUrl?.startsWith("http") ? { url: aiResult.generatedImageUrl } : null);
              if (imgSource) {
                sendResult = await sock.sendMessage(jid, { image: imgSource as any, caption: aiResult.response }, { quoted: msg as any });
              } else {
                sendResult = await sock.sendMessage(jid, { text: aiResult.response }, { quoted: msg as any });
              }
            } else {
              sendResult = await sock.sendMessage(jid, { text: aiResult.response }, { quoted: msg as any });
            }

            await sock.sendPresenceUpdate("paused", jid).catch(() => {});

            if (sendResult?.key?.id) {
              this.sentBotMessageIds.add(sendResult.key.id);
              this.processedInboundMessageIds.add(sendResult.key.id);
            }

            const outMessageType = isImageMsg ? "image" : "text";
            prisma.message
              .create({
                data: {
                  id: replyId,
                  sessionId,
                  chatId: senderJid,
                  senderId: sessionId,
                  direction: "outbound",
                  messageType: outMessageType as any,
                  content: aiResult.response,
                  mediaUrl: aiResult.generatedImageUrl || null,
                  status: "sent",
                  sentAt: new Date(),
                },
              })
              .catch((e) => logger.error({ e }, "[Auto-Reply DB Error]"));

            eventBus.emitGatewayEvent({
              type: "message:sent",
              sessionId,
              data: {
                messageId: replyId,
                chatId: senderJid,
                messageType: outMessageType,
                content: aiResult.response,
                delaySeconds: 1,
              },
            });
          }
        } catch (replyErr) {
          logger.error({ replyErr }, "[Auto-Reply Error]");
        }
      }
    }
  }

  public async logoutSession(sessionId: string): Promise<boolean> {
    const sock = this.sockets.get(sessionId);
    if (sock) {
      try { await sock.logout(); } catch {}
      this.sockets.delete(sessionId);
    }
    this.unregisterSocketSender(sessionId);
    this.qrCodes.delete(sessionId);
    this.sessionCache.delete(sessionId);

    await clearPostgresAuthState(sessionId);

    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: SessionStatus.logged_out, qrCode: null },
      });
    } catch {}

    return true;
  }

  public async executePresenceUpdate(
    sock: WASocket,
    chatId: string,
    presence: "composing" | "recording" | "paused"
  ): Promise<void> {
    const jid = formatWhatsAppJid(chatId);
    try {
      await sock.sendPresenceUpdate(presence, jid);
    } catch {}
  }

  public async executeSendSocketMessage(sock: WASocket, item: any): Promise<any> {
    const jid = formatWhatsAppJid(item.chatId);
    logger.debug(`[SessionManager] Sending ${item.messageType} to ${jid}`);

    let sendResult: any;
    let mediaBuffer = item.mediaBuffer;

    if (!mediaBuffer && item.mediaUrl) {
      try {
        const filename = path.basename(item.mediaUrl);
        const mediaDoc = await prisma.mediaFile.findUnique({ where: { filename } });
        if (mediaDoc?.data) mediaBuffer = Buffer.from(mediaDoc.data);
      } catch {}
    }

    if (item.messageType === "text") {
      sendResult = await sock.sendMessage(jid, { text: item.content });
    } else if (item.messageType === "image") {
      const src = mediaBuffer || (item.mediaUrl?.startsWith("http") ? { url: item.mediaUrl } : null);
      if (!src) throw new Error("Image buffer or URL missing");
      sendResult = await sock.sendMessage(jid, { image: src as any, caption: item.content || undefined });
    } else if (item.messageType === "sticker") {
      const src = mediaBuffer || (item.mediaUrl?.startsWith("http") ? { url: item.mediaUrl } : null);
      if (!src) throw new Error("Sticker buffer or URL missing");
      sendResult = await sock.sendMessage(jid, { sticker: src as any });
    } else if (item.messageType === "video") {
      const src = mediaBuffer || (item.mediaUrl?.startsWith("http") ? { url: item.mediaUrl } : null);
      if (!src) throw new Error("Video buffer or URL missing");
      sendResult = await sock.sendMessage(jid, { video: src as any, caption: item.content || undefined, mimetype: item.mimetype || "video/mp4" });
    } else if (item.messageType === "document") {
      const src = mediaBuffer || (item.mediaUrl?.startsWith("http") ? { url: item.mediaUrl } : null);
      if (!src) throw new Error("Document buffer or URL missing");
      sendResult = await sock.sendMessage(jid, { document: src as any, mimetype: item.mimetype || "application/pdf", fileName: item.fileName || "document.pdf", caption: item.content || undefined });
    } else if (item.messageType === "audio") {
      const src = mediaBuffer || (item.mediaUrl?.startsWith("http") ? { url: item.mediaUrl } : null);
      if (!src) throw new Error("Audio buffer or URL missing");
      sendResult = await sock.sendMessage(jid, { audio: src as any, mimetype: item.mimetype || "audio/mp4", ptt: true });
    } else if (item.messageType === "reaction") {
      sendResult = await sock.sendMessage(jid, { react: { text: item.content, key: item.reactionKey } });
    }

    if (sendResult?.key?.id) {
      this.sentBotMessageIds.add(sendResult.key.id);
      this.processedInboundMessageIds.add(sendResult.key.id);
    }

    try { await sock.sendPresenceUpdate("paused", jid); } catch {}
    return sendResult;
  }

  public getSocket(sessionId: string): WASocket | undefined {
    return this.sockets.get(sessionId);
  }

  public getSession(sessionId: string): SessionInfo | null {
    const cached = this.sessionCache.get(sessionId);
    if (!cached) return null;
    const qrData = this.qrCodes.get(sessionId);
    return {
      id: cached.id || sessionId,
      name: cached.name || sessionId,
      phoneNumber: cached.phoneNumber || cached.phone_number,
      status: cached.status || "disconnected",
      qrCode: qrData?.raw || cached.qrCode,
      qrDataUrl: qrData?.dataUrl || null,
      reconnectAttempts: cached.reconnectAttempts || cached.reconnect_attempts || 0,
      autoReconnect: cached.autoReconnect ?? (cached.auto_reconnect === 1),
      createdAt:
        typeof cached.createdAt === "object"
          ? cached.createdAt?.toISOString()
          : cached.createdAt || cached.created_at || new Date().toISOString(),
      lastConnectedAt: cached.lastConnectedAt
        ? typeof cached.lastConnectedAt === "object"
          ? cached.lastConnectedAt?.toISOString()
          : cached.lastConnectedAt
        : null,
    };
  }

  public async getSessionAsync(sessionId: string): Promise<SessionInfo | null> {
    let session = this.getSession(sessionId);
    if (session) return session;

    try {
      const doc = await prisma.session.findUnique({ where: { id: sessionId } });
      if (doc) {
        this.sessionCache.set(doc.id, doc);
        if (!this.sockets.has(doc.id) && doc.status !== SessionStatus.logged_out) {
          this.startSession(doc.id, doc.name).catch(() => {});
        }
        return this.getSession(sessionId);
      }
    } catch {}

    return null;
  }

  public getAllSessions(): SessionInfo[] {
    const list: SessionInfo[] = [];
    for (const [id] of this.sessionCache.entries()) {
      const s = this.getSession(id);
      if (s) list.push(s);
    }
    return list;
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    const sock = this.sockets.get(sessionId);
    if (sock) {
      try { await sock.logout(); } catch {}
      this.sockets.delete(sessionId);
    }
    this.unregisterSocketSender(sessionId);
    this.qrCodes.delete(sessionId);
    this.sessionCache.delete(sessionId);

    await clearPostgresAuthState(sessionId);

    try {
      await prisma.session.delete({ where: { id: sessionId } });
    } catch {}

    return true;
  }
}

export const sessionManager = WhatsAppSessionManager.getInstance();
export default WhatsAppSessionManager;
