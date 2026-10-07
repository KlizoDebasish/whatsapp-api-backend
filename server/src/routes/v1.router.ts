import { Router, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import healthRouter from "../modules/health/health.router";
import sessionsRouter from "../modules/sessions/sessions.router";
import messagesRouter from "../modules/messages/messages.router";
import apiKeysRouter from "../modules/api-keys/api-keys.router";
import webhooksRouter from "../modules/webhooks/webhooks.router";
import configRouter from "../modules/config/config.router";
import erpRouter from "../modules/erp/erp.router";
import mediaRouter from "../modules/media/media.router";
import toolsRouter from "../modules/tools/tools.router";
import ragRouter from "../modules/rag/rag.router";
import { registerSSEClient } from "../sockets/gateway";

const v1Router = Router();

// Swagger API documentation spec
const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "WhatsApp API Gateway ERP & LangChain RAG Engine",
    version: "1.0.0",
    description: "Enterprise WhatsApp Gateway & LangChain RAG Knowledge Base REST API",
  },
  servers: [
    {
      url: "/api/v1",
      description: "v1 API Server",
    },
  ],
  paths: {
    "/health": {
      get: { summary: "Check system health" },
    },
    "/sessions": {
      get: { summary: "List all WhatsApp sessions" },
    },
    "/rag/documents": {
      get: { summary: "List RAG Knowledge Base documents" },
    },
    "/rag/upload": {
      post: { summary: "Upload PDF and index into vector store with LangChain & gemini-embedding-001" },
    },
    "/rag/query": {
      post: { summary: "Execute RAG similarity search and LangChain chain execution" },
    },
  },
};

// Mount module routes
v1Router.use("/health", healthRouter);
v1Router.use("/sessions", sessionsRouter);
v1Router.use("/messages", messagesRouter);
v1Router.use("/api-keys", apiKeysRouter);
v1Router.use("/webhooks", webhooksRouter);
v1Router.use("/config", configRouter);
v1Router.use("/erp", erpRouter);
v1Router.use("/media", mediaRouter);
v1Router.use("/tools", toolsRouter);
v1Router.use("/rag", ragRouter);

// SSE Events Endpoint
v1Router.get("/events", (req: Request, res: Response) => {
  registerSSEClient(res);
});

// Swagger Docs Endpoint
v1Router.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

export default v1Router;
