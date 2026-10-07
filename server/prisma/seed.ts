import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

const defaultConfigs: Record<string, string> = {
  safety_profile: "balanced",
  min_delay_seconds: "8",
  max_delay_seconds: "18",
  typing_simulation: "true",
  typing_speed_wpm: "60",
  anti_blast_limit_per_min: "30",
  ai_auto_reply: "true",
  ai_voice_erp_query: "true",
  ai_system_prompt:
    "You are an intelligent ERP and Business Assistant. You help answering stock, sales, inventory, and order questions concisely and accurately for WhatsApp users.",
  gemini_api_key: process.env.GEMINI_API_KEY || "",
};

async function main() {
  console.log("🌱 Seeding PostgreSQL database...");

  // 1. Gateway Config
  for (const [key, value] of Object.entries(defaultConfigs)) {
    await prisma.gatewayConfig.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  console.log("✅ Gateway config seeded");

  // 2. ERP Products
  const productCount = await prisma.erpProduct.count();
  if (productCount === 0) {
    const products = await prisma.erpProduct.createMany({
      data: [
        { sku: "PROD-101", name: "Wireless Ergonomic Mouse", category: "Electronics", price: 29.99, stockQuantity: 145, unit: "pcs", reorderLevel: 20 },
        { sku: "PROD-102", name: "Mechanical Gaming Keyboard RGB", category: "Electronics", price: 79.99, stockQuantity: 58, unit: "pcs", reorderLevel: 15 },
        { sku: "PROD-103", name: "Ultra-Wide 34-inch 4K Monitor", category: "Displays", price: 449.0, stockQuantity: 18, unit: "pcs", reorderLevel: 5 },
        { sku: "PROD-104", name: "Noise-Cancelling Bluetooth Headset", category: "Audio", price: 129.5, stockQuantity: 84, unit: "pcs", reorderLevel: 10 },
        { sku: "PROD-105", name: "USB-C Multi-Port Hub (8-in-1)", category: "Accessories", price: 39.99, stockQuantity: 210, unit: "pcs", reorderLevel: 25 },
        { sku: "PROD-106", name: "Standing Desk Converter Pro", category: "Furniture", price: 199.0, stockQuantity: 12, unit: "pcs", reorderLevel: 8 },
        { sku: "PROD-107", name: "High-Speed Thermal Receipt Printer", category: "POS", price: 149.99, stockQuantity: 32, unit: "pcs", reorderLevel: 6 },
        { sku: "PROD-108", name: "Heavy Duty Barcode Scanner (2D)", category: "POS", price: 89.0, stockQuantity: 4, unit: "pcs", reorderLevel: 10 },
      ],
    });
    console.log(`✅ ${products.count} ERP products seeded`);

    // 3. ERP Sales (seed against the products we just created)
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);

    const p1 = await prisma.erpProduct.findFirst({ where: { sku: "PROD-101" } });
    const p2 = await prisma.erpProduct.findFirst({ where: { sku: "PROD-102" } });
    const p3 = await prisma.erpProduct.findFirst({ where: { sku: "PROD-103" } });
    const p4 = await prisma.erpProduct.findFirst({ where: { sku: "PROD-104" } });
    const p5 = await prisma.erpProduct.findFirst({ where: { sku: "PROD-105" } });

    if (p1 && p2 && p3 && p4 && p5) {
      await prisma.erpSale.createMany({
        data: [
          { orderId: "ORD-9001", productId: p1.id, productName: p1.name, quantity: 2, unitPrice: 29.99, totalAmount: 59.98, customerName: "John Doe", customerPhone: "+1234567890", saleDate: today },
          { orderId: "ORD-9002", productId: p2.id, productName: p2.name, quantity: 1, unitPrice: 79.99, totalAmount: 79.99, customerName: "Sarah Connor", customerPhone: "+1987654321", saleDate: today },
          { orderId: "ORD-9003", productId: p5.id, productName: p5.name, quantity: 3, unitPrice: 39.99, totalAmount: 119.97, customerName: "Tech Corp Inc.", customerPhone: "+1555123456", saleDate: today },
          { orderId: "ORD-9004", productId: p4.id, productName: p4.name, quantity: 1, unitPrice: 129.5, totalAmount: 129.5, customerName: "Alice Smith", customerPhone: "+1444987654", saleDate: yesterday },
          { orderId: "ORD-9005", productId: p3.id, productName: p3.name, quantity: 1, unitPrice: 449.0, totalAmount: 449.0, customerName: "Apex Design Studio", customerPhone: "+1888333222", saleDate: yesterday },
        ],
      });
      console.log("✅ ERP sales seeded");
    }
  }

  // 4. Default API Keys
  const keyCount = await prisma.apiKey.count();
  if (keyCount === 0) {
    await prisma.apiKey.createMany({
      data: [
        {
          id: "key_master_default",
          name: "Master Admin Key (Full Access)",
          keyHash: "wag_live_admin_master_key_9988",
          keyPrefix: "wag_live_admin...",
          allowedChats: '"*"',
          permissions: ["messages:send", "messages:read", "sessions:manage", "erp:query", "webhooks:manage"],
          rateLimitPerMin: 120,
          isActive: true,
        },
        {
          id: "key_demo_support_bot",
          name: "Customer Support Bot Key (Restricted)",
          keyHash: "wag_live_bot_support_key_1122",
          keyPrefix: "wag_live_bot...",
          allowedChats: JSON.stringify(["*@s.whatsapp.net"]),
          permissions: ["messages:send", "messages:read", "erp:query"],
          rateLimitPerMin: 30,
          isActive: true,
        },
      ],
    });
    console.log("✅ API keys seeded");
  }

  // 5. Default webhook from env
  const webhookUrl = process.env.WEBHOOK_URL?.trim();
  if (webhookUrl) {
    await prisma.webhook.upsert({
      where: { id: "wh_env_default" },
      update: {
        name: process.env.WEBHOOK_NAME || "Default Server Webhook",
        url: webhookUrl,
        secret: process.env.WEBHOOK_SECRET || "",
        events: ["*"],
        isActive: true,
      },
      create: {
        id: "wh_env_default",
        name: process.env.WEBHOOK_NAME || "Default Server Webhook",
        url: webhookUrl,
        secret: process.env.WEBHOOK_SECRET || "",
        events: ["*"],
        isActive: true,
      },
    });
    console.log("✅ Default webhook seeded from .env");
  }

  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
