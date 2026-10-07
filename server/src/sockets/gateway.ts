import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { Response } from "express";
import { eventBus } from "../services/event-bus";
import { logger } from "../utils/logger";

let io: SocketIOServer | null = null;
const sseClients = new Set<Response>();

export function initSocketGateway(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.on("connection", (socket: Socket) => {
    logger.info(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on("subscribe:session", (sessionId: string) => {
      socket.join(`session:${sessionId}`);
      logger.info(`[Socket.IO] ${socket.id} joined room session:${sessionId}`);
    });

    socket.on("unsubscribe:session", (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
    });

    socket.on("disconnect", () => {
      logger.info(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  // Subscribe to internal event bus & broadcast to Socket.IO and SSE clients
  eventBus.onGatewayEvent((event) => {
    // Broadcast via Socket.IO
    if (io) {
      io.emit("gateway:event", event);
      if (event.sessionId) {
        io.to(`session:${event.sessionId}`).emit(`session:${event.type}`, event);
      }
    }

    // Broadcast via SSE
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const clientRes of sseClients) {
      try {
        clientRes.write(payload);
      } catch (err) {
        sseClients.delete(clientRes);
      }
    }
  });

  return io;
}

export function registerSSEClient(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

  sseClients.add(res);

  res.on("close", () => {
    sseClients.delete(res);
  });
}

export function getIO(): SocketIOServer | null {
  return io;
}
