// ── Ported from lib/gateway/ai-erp-engine.ts — now uses Prisma + LangChain RAG ──

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../config/database";
import { eventBus } from "./event-bus";
import { validateContentSafety } from "../utils/content-security";
import { detectLanguage } from "../utils/language-detector";
import { executeWebSearch, executeBrowsePage } from "../utils/browser-query-tool";
import { isImageGenerationRequest, generateAIImage } from "../utils/image-generator";
import { langchainRagService } from "./langchain-rag.service";
import { env } from "../config";
import { logger } from "../utils/logger";
import path from "path";

export interface MultimodalAIInput {
  text?: string;
  audioBase64?: string;
  audioMimeType?: string;
  imageBase64?: string;
  imageMimeType?: string;
  imageUrl?: string;
  mimeType?: string;
  pushName?: string;
}

export interface AIQueryResponse {
  queryText: string;
  response: string;
  sqlExecuted?: string;
  data?: any;
  isErpQuery: boolean;
  source: "voice" | "text" | "image";
  detectedLanguage?: string;
  isSecurityViolation?: boolean;
  generatedImageUrl?: string;
  generatedImageBase64?: string;
  generatedImageBuffer?: Buffer;
  messageType?: "text" | "image";
  ragChunks?: any[];
}

const GEMINI_MODELS = [
  env.GEMINI_LLM_MODEL || "gemini-3.7-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

interface ChatContentPart {
  text?: string;
  inlineData?: { data: string; mimeType: string };
}

interface ChatMessageTurn {
  role: "user" | "model";
  parts: ChatContentPart[];
}

async function callGeminiMultimodal(
  ai: GoogleGenAI,
  conversationTurns: ChatMessageTurn[],
  systemInstruction?: string
): Promise<string> {
  let lastError: any = null;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: conversationTurns as any,
        config: systemInstruction
          ? { systemInstruction: { parts: [{ text: systemInstruction }] }, temperature: 0.35 }
          : { temperature: 0.35 },
      });

      const text = response.text?.trim() || "";
      if (text) return text;
    } catch (err: any) {
      lastError = err;
      logger.warn(`[Gemini] Model ${model} skipped: ${err?.message}`);
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

export async function processVoiceOrTextQuery(
  input: MultimodalAIInput,
  sessionId: string,
  senderJid: string
): Promise<AIQueryResponse> {
  // 1. Fetch config
  let config: Record<string, string> = {};
  try {
    const rows = await prisma.gatewayConfig.findMany();
    config = rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {} as Record<string, string>);
  } catch {}

  const geminiKey = (config.gemini_api_key || process.env.GEMINI_API_KEY || "").trim();

  let queryText = (input.text || "").trim();
  let imageBase64 = input.imageBase64;
  let imageMimeType = input.imageMimeType || "image/jpeg";
  const audioBase64 = input.audioBase64;
  const audioMimeType = input.audioMimeType || "audio/ogg";

  let source: "voice" | "text" | "image" = "text";
  if (imageBase64 || input.imageUrl) source = "image";
  else if (audioBase64) source = "voice";

  // Load image from DB if URL provided
  if (!imageBase64 && input.imageUrl) {
    try {
      const filename = path.basename(input.imageUrl);
      const mediaDoc = await prisma.mediaFile.findUnique({ where: { filename } });
      if (mediaDoc?.data) {
        imageBase64 = Buffer.from(mediaDoc.data).toString("base64");
        imageMimeType = mediaDoc.contentType;
      }
    } catch {}
  }

  // Transcribe voice
  if (audioBase64 && geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      for (const model of GEMINI_MODELS) {
        try {
          const r = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ inlineData: { data: audioBase64, mimeType: audioMimeType } }, { text: "Transcribe this audio note accurately. Return only the exact speech without quotes or explanation." }] }],
          });
          const t = r.text?.trim();
          if (t) { queryText = t; break; }
        } catch {}
      }
    } catch {}
  }

  const detectedLang = detectLanguage(queryText);

  // Content safety
  if (queryText) {
    const safetyCheck = validateContentSafety(queryText);
    if (!safetyCheck.isSafe) {
      logger.warn(`[ContentSecurity] Blocked from ${senderJid}: ${safetyCheck.violationType}`);
      eventBus.emitGatewayEvent({
        type: "erp:query_executed",
        sessionId,
        data: { senderJid, query: queryText, violation: safetyCheck.violationType, blocked: true, source },
      });
      return { queryText, response: safetyCheck.errorMessage, isErpQuery: false, source, detectedLanguage: detectedLang.name, isSecurityViolation: true };
    }
  }

  // Image generation check
  if (queryText && !imageBase64) {
    const imgCheck = isImageGenerationRequest(queryText);
    if (imgCheck.isImageRequest) {
      const genResult = await generateAIImage(imgCheck.extractedPrompt, geminiKey);
      if (genResult.success) {
        return {
          queryText, response: genResult.caption, generatedImageUrl: genResult.imageUrl,
          generatedImageBase64: genResult.imageBase64, generatedImageBuffer: genResult.imageBuffer,
          isErpQuery: false, source, detectedLanguage: detectedLang.name, messageType: "image",
        };
      }
    }
  }

  // LangChain RAG vector retrieval
  let ragContext = "";
  let matchedRagChunks: any[] = [];
  if (queryText) {
    try {
      matchedRagChunks = await langchainRagService.searchSimilarChunks(queryText, 3);
      const relevant = matchedRagChunks.filter((c) => c.similarity >= 0.15);
      if (relevant.length > 0) {
        ragContext = "\n\nRAG KNOWLEDGE BASE DOCUMENTS:\n" +
          relevant.map((c, i) => `[Document: ${c.documentName} (Match: ${Math.round(c.similarity * 100)}%)]\n${c.content}`).join("\n\n");
      }
    } catch {}
  }

  // Gemini multimodal
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const [liveProducts, recentSales, allSales] = await Promise.all([
        prisma.erpProduct.findMany(),
        prisma.erpSale.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
        prisma.erpSale.findMany(),
      ]);

      const totalRevenue = allSales.reduce((s, r) => s + Number(r.totalAmount), 0);
      const totalItemsSold = allSales.reduce((s, r) => s + r.quantity, 0);
      const salesSummary = { total_orders: allSales.length, total_revenue: totalRevenue, total_items_sold: totalItemsSold };

      let historyRows: any[] = [];
      try {
        historyRows = await prisma.message.findMany({
          where: { OR: [{ chatId: senderJid }, { senderId: senderJid }] },
          orderBy: { createdAt: "desc" },
          take: 8,
        });
      } catch {}

      const conversationTurns: ChatMessageTurn[] = [];
      if (historyRows.length > 0) {
        for (const row of [...historyRows].reverse()) {
          const role = row.direction === "outbound" ? "model" : "user";
          const text = String(row.content || "").trim();
          if (text) conversationTurns.push({ role, parts: [{ text }] });
        }
      }

      const currentParts: ChatContentPart[] = [];
      if (imageBase64) currentParts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });

      let effectiveUserPrompt = queryText;
      if (!effectiveUserPrompt) {
        effectiveUserPrompt = imageBase64 ? "Analyze this image and provide relevant ERP details." : "Hello";
      }
      currentParts.push({ text: effectiveUserPrompt });
      conversationTurns.push({ role: "user", parts: currentParts });

      // Live web context
      let liveWebContext = "";
      const lowerPrompt = effectiveUserPrompt.toLowerCase();
      const urlMatch = effectiveUserPrompt.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        try {
          const pageText = await executeBrowsePage(urlMatch[0], 2500);
          if (pageText) liveWebContext = `\n• Live Web Page: ${pageText}`;
        } catch {}
      } else if (lowerPrompt.includes("search") || lowerPrompt.includes("latest") || lowerPrompt.includes("weather")) {
        try {
          const results = await executeWebSearch(effectiveUserPrompt, 3);
          if (results.length) liveWebContext = `\n• Live Search Results: ${JSON.stringify(results)}`;
        } catch {}
      }

      const customerGreeting = input.pushName ? ` (Customer: ${input.pushName})` : "";
      const systemPrompt = `You are an authentic, highly responsive human business representative and store manager on WhatsApp${customerGreeting}.

CRITICAL RULES:
1. FULLY DYNAMIC INTENT ADAPTATION — reply directly to the customer's exact intent.
2. If RAG Knowledge Base documents match the query, incorporate the retrieved document details accurately into your answer.
3. NEVER say "As an AI", "I am an AI", "automated response", or similar. Speak naturally as a human store manager.
4. MIRROR the user's language, script, and tone exactly (Bengali, Hindi, Hinglish, Banglish, Spanish, English, etc.).
5. Use WhatsApp bold (*text*) for product names, prices. Use code format for SKUs.
6. Keep responses concise and mobile-friendly.

LIVE STORE DATA:
• Products: ${JSON.stringify(liveProducts)}
• Recent Sales: ${JSON.stringify(recentSales)}
• Summary: ${JSON.stringify(salesSummary)}${liveWebContext}${ragContext}`;

      const aiResponse = await callGeminiMultimodal(ai, conversationTurns, systemPrompt);

      if (aiResponse?.trim()) {
        const trimmed = aiResponse.trim();

        if (trimmed.includes("<svg") || trimmed.includes("cannot generate binary image") || trimmed.includes("DALL-E")) {
          const genResult = await generateAIImage(effectiveUserPrompt, geminiKey);
          if (genResult.success) {
            return { queryText: effectiveUserPrompt, response: genResult.caption, generatedImageUrl: genResult.imageUrl, generatedImageBase64: genResult.imageBase64, generatedImageBuffer: genResult.imageBuffer, isErpQuery: false, source, detectedLanguage: detectedLang.name, messageType: "image", ragChunks: matchedRagChunks };
          }
        }

        const isErp = !!imageBase64 || /stock|price|product|sale|order|দাম|স্টক|कीमत|স্টॉक/i.test(queryText);

        eventBus.emitGatewayEvent({
          type: "erp:query_executed",
          sessionId,
          data: { senderJid, query: effectiveUserPrompt, rowCount: liveProducts.length, hasImage: !!imageBase64, detectedLanguage: detectedLang.name, source, ragCount: matchedRagChunks.length },
        });

        return { queryText: effectiveUserPrompt, response: trimmed, isErpQuery: isErp, source, detectedLanguage: detectedLang.name, ragChunks: matchedRagChunks };
      }
    } catch (e) {
      logger.warn({ e }, "[AI Engine] Gemini multimodal failed, using rule-based fallback");
    }
  }

  // Rule-based NLP fallback
  const q = queryText.toLowerCase().trim();
  let allProducts: any[] = [];
  let allSalesRecords: any[] = [];
  try {
    [allProducts, allSalesRecords] = await Promise.all([
      prisma.erpProduct.findMany(),
      prisma.erpSale.findMany(),
    ]);
  } catch {}

  const langCode = detectedLang.code;
  const pushGreeting = input.pushName ? ` ${input.pushName}` : "";
  let fallbackResponse = "";
  let isErp = false;
  let matchedProduct: any = null;

  if (imageBase64) {
    isErp = true;
    if (langCode === "bn") fallbackResponse = `📸 *ছবিটি পেয়েছি!* অনুগ্রহ করে জানান এই পণ্য সম্পর্কে কী জানতে চান।`;
    else if (langCode === "hi") fallbackResponse = `📸 *फोटो प्राप्त हुई!* कृपया बताएं कि इस आइटम के बारे में क्या जानकारी चाहिए।`;
    else fallbackResponse = `📸 *Image received!* Please let us know what information you need about this item.`;
  } else {
    matchedProduct = allProducts.find(
      (p) => q.includes(p.name?.toLowerCase()) || q.includes(p.sku?.toLowerCase()) ||
        (p.name && q.split(/\s+/).some((w: string) => w.length >= 4 && p.name.toLowerCase().includes(w)))
    );

    if (matchedProduct) {
      isErp = true;
      if (langCode === "bn") fallbackResponse = `📦 *${matchedProduct.name}* (\`${matchedProduct.sku}\`)\n• দাম: *$${Number(matchedProduct.price).toFixed(2)}*\n• স্টক: *${matchedProduct.stockQuantity} ${matchedProduct.unit}*`;
      else if (langCode === "hi") fallbackResponse = `📦 *${matchedProduct.name}* (\`${matchedProduct.sku}\`)\n• मूल्य: *$${Number(matchedProduct.price).toFixed(2)}*\n• स्टॉक: *${matchedProduct.stockQuantity} ${matchedProduct.unit}*`;
      else fallbackResponse = `📦 *${matchedProduct.name}* (\`${matchedProduct.sku}\`)\n• Price: *$${Number(matchedProduct.price).toFixed(2)}*\n• Stock: *${matchedProduct.stockQuantity} ${matchedProduct.unit}*`;
    } else if (q.includes("low stock") || q.includes("inventory") || q.includes("reorder")) {
      isErp = true;
      const lowStock = allProducts.filter((p) => p.stockQuantity <= (p.reorderLevel || 10));
      if (lowStock.length > 0) {
        const list = lowStock.map((p) => `• *${p.name}*: *${p.stockQuantity} ${p.unit}*`).join("\n");
        fallbackResponse = `⚠️ *Low Stock Alert:*\n${list}`;
      } else {
        fallbackResponse = `✅ All inventory levels are healthy! *${allProducts.length} products* in stock.`;
      }
    } else if (q.includes("sale") || q.includes("revenue") || q.includes("order")) {
      isErp = true;
      const totalRev = allSalesRecords.reduce((s, r) => s + Number(r.totalAmount), 0);
      const totalUnits = allSalesRecords.reduce((s, r) => s + r.quantity, 0);
      fallbackResponse = `📊 *Sales Summary:*\n• Total Orders: *${allSalesRecords.length}*\n• Revenue: *$${totalRev.toFixed(2)}*\n• Items Sold: *${totalUnits}*`;
    } else if (/\b(hi|hello|hey|namaste|nomoshkar)\b/i.test(q)) {
      if (langCode === "bn") fallbackResponse = `নমস্কার${pushGreeting}! আজ আপনাকে কীভাবে সাহায্য করতে পারি?`;
      else if (langCode === "hi") fallbackResponse = `नमस्ते${pushGreeting}! हम आपकी किस प्रकार सहायता कर सकते हैं?`;
      else fallbackResponse = `Hello${pushGreeting}! How can we help you today?`;
    } else if (/\b(thank|thanks|dhonnobad|dhanyawad)\b/i.test(q)) {
      if (langCode === "bn") fallbackResponse = `আপনাকেও অনেক ধন্যবাদ${pushGreeting}!`;
      else if (langCode === "hi") fallbackResponse = `आपका बहुत-much धन्यवाद${pushGreeting}!`;
      else fallbackResponse = `You're very welcome${pushGreeting}! Have a great day.`;
    } else {
      if (langCode === "bn") fallbackResponse = `ধন্যবাদ${pushGreeting}। পণ্যের নাম বা দাম সংক্রান্ত প্রশ্ন করুন।`;
      else if (langCode === "hi") fallbackResponse = `धन्यवाद${pushGreeting}। उत्पाद का नाम या कीमत से जुड़ा प्रश्न लिखें।`;
      else fallbackResponse = `Thanks${pushGreeting}. Please ask about any product, price, or stock.`;
    }
  }

  return {
    queryText: queryText || "[Query]",
    response: fallbackResponse,
    isErpQuery: isErp || !!matchedProduct || !!imageBase64,
    source,
    detectedLanguage: detectedLang.name,
    ragChunks: matchedRagChunks,
  };
}
