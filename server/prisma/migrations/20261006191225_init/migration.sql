-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('disconnected', 'connecting', 'qr_ready', 'connected', 'logged_out');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'document', 'audio', 'video', 'sticker', 'reaction');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('queued', 'typing', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "InventoryLogType" AS ENUM ('in', 'out', 'adjustment');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'disconnected',
    "qr_code" TEXT,
    "reconnect_attempts" INTEGER NOT NULL DEFAULT 0,
    "auto_reconnect" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_connected_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_auth_state" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_auth_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "allowed_chats" TEXT NOT NULL DEFAULT '"*"',
    "permissions" TEXT[],
    "rate_limit_per_min" INTEGER NOT NULL DEFAULT 60,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages_log" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "message_type" "MessageType" NOT NULL,
    "content" TEXT,
    "media_url" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'queued',
    "delay_seconds" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_products" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "reorder_level" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_sales" (
    "id" SERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "sale_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_inventory_logs" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "type" "InventoryLogType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_inventory_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" SERIAL NOT NULL,
    "webhook_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "response_code" INTEGER,
    "response_body" TEXT,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "execution_time_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "media_files" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "content_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_auth_state_session_id_idx" ON "session_auth_state"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_auth_state_session_id_key_id_key" ON "session_auth_state"("session_id", "key_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "messages_log_session_id_created_at_idx" ON "messages_log"("session_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_log_chat_id_created_at_idx" ON "messages_log"("chat_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "erp_products_sku_key" ON "erp_products"("sku");

-- CreateIndex
CREATE INDEX "erp_sales_order_id_idx" ON "erp_sales"("order_id");

-- CreateIndex
CREATE INDEX "erp_sales_sale_date_idx" ON "erp_sales"("sale_date" DESC);

-- CreateIndex
CREATE INDEX "erp_inventory_logs_product_id_idx" ON "erp_inventory_logs"("product_id");

-- CreateIndex
CREATE INDEX "webhook_logs_webhook_id_created_at_idx" ON "webhook_logs"("webhook_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "media_files_filename_key" ON "media_files"("filename");

-- AddForeignKey
ALTER TABLE "session_auth_state" ADD CONSTRAINT "session_auth_state_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages_log" ADD CONSTRAINT "messages_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_sales" ADD CONSTRAINT "erp_sales_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "erp_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_inventory_logs" ADD CONSTRAINT "erp_inventory_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "erp_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
