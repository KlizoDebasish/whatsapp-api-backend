import http from "http";
import { createApp } from "./app";
import { env } from "./config";
import { logger } from "./utils/logger";
import { initSocketGateway } from "./sockets/gateway";
import WhatsAppSessionManager from "./services/session-manager";

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO gateway
  initSocketGateway(server);

  // Start HTTP Server
  server.listen(env.PORT, () => {
    logger.info(`🚀 Server listening on port ${env.PORT} [env: ${env.NODE_ENV}]`);
    logger.info(`📖 API Documentation available at http://localhost:${env.PORT}/api/v1/docs`);
  });

  // Initialize WhatsApp Baileys Sessions
  WhatsAppSessionManager.getInstance()
    .initialize()
    .catch((err) => {
      logger.error({ err }, "Failed to initialize WhatsApp Session Manager");
    });

  // Graceful shutdown handling
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      logger.info("HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
