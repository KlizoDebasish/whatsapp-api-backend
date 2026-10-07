// ── Ported from lib/gateway/image-generator.ts ──

import { GoogleGenAI } from "@google/genai";
import { logger } from "./logger";
import { prisma } from "../config/database";

const IMAGE_REQUEST_PATTERNS = [
  /\b(generate|create|make|draw|show|paint|design|illustrate|produce)\b.{0,40}\b(image|picture|photo|pic|illustration|artwork|graphic|portrait|logo|banner|meme)\b/i,
  /\b(image|picture|photo)\b.{0,25}\b(of|showing|with|about)\b/i,
  /send (me |us )?(an? )?(image|picture|photo|pic)/i,
];

export function isImageGenerationRequest(text: string): {
  isImageRequest: boolean;
  extractedPrompt: string;
} {
  if (!text || text.trim().length < 5) {
    return { isImageRequest: false, extractedPrompt: "" };
  }

  for (const pattern of IMAGE_REQUEST_PATTERNS) {
    if (pattern.test(text)) {
      const cleanedPrompt = text
        .replace(/^(please |can you |could you |would you )/i, "")
        .replace(/(generate|create|make|draw|show|paint|design|illustrate|produce|send me|send us)\s+(an?\s+)?(image|picture|photo|pic|illustration|artwork|graphic|portrait|logo|banner|meme)\s+(of\s+)?/i, "")
        .trim();
      return {
        isImageRequest: true,
        extractedPrompt: cleanedPrompt || text,
      };
    }
  }

  return { isImageRequest: false, extractedPrompt: "" };
}

export async function generateAIImage(
  prompt: string,
  geminiApiKey: string
): Promise<{
  success: boolean;
  imageUrl?: string;
  imageBase64?: string;
  imageBuffer?: Buffer;
  caption: string;
  error?: string;
}> {
  if (!geminiApiKey || !prompt) {
    return { success: false, caption: "", error: "No API key or prompt" };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const imageModels = [
      "imagen-3.0-generate-002",
      "imagen-3.0-generate-001",
      "imagen-3.0-fast-generate-001",
    ];

    for (const model of imageModels) {
      try {
        const res = await (ai.models as any).generateImages({
          model,
          prompt,
          config: { numberOfImages: 1, aspectRatio: "1:1" },
        });

        const imageData = res?.generatedImages?.[0]?.image?.imageBytes;
        if (imageData) {
          const buffer = Buffer.from(imageData, "base64");

          // Persist to media_files table
          const filename = `ai_gen_${Date.now()}.png`;
          await prisma.mediaFile.upsert({
            where: { filename },
            update: { data: buffer, contentType: "image/png", size: buffer.length },
            create: { filename, data: buffer, contentType: "image/png", size: buffer.length },
          });

          const caption = `✨ Here is your generated image: "${prompt}"`;
          return {
            success: true,
            imageUrl: `/api/v1/media/${filename}`,
            imageBase64: imageData,
            imageBuffer: buffer,
            caption,
          };
        }
      } catch (err) {
        logger.warn({ model, err }, "[ImageGenerator] Model failed, trying next");
      }
    }

    return { success: false, caption: "", error: "All image models failed" };
  } catch (err: any) {
    logger.error({ err }, "[ImageGenerator] Fatal error");
    return { success: false, caption: "", error: err.message };
  }
}
