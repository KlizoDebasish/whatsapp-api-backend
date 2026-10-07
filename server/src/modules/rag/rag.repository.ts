import { prisma } from "../../config/database";
import { env } from "../../config";

export class RagRepository {
  async getDocuments() {
    return prisma.ragDocument.findMany({
      include: {
        _count: {
          select: { chunks: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getDocumentById(id: string) {
    return prisma.ragDocument.findUnique({
      where: { id },
      include: { chunks: true },
    });
  }

  async deleteDocument(id: string) {
    return prisma.ragDocument.delete({
      where: { id },
    });
  }

  async getStats() {
    const [docCount, chunkCount] = await Promise.all([
      prisma.ragDocument.count(),
      prisma.ragChunk.count(),
    ]);

    return {
      totalDocuments: docCount,
      totalChunks: chunkCount,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2",
      vectorDimensions: env.GEMINI_EMBEDDING_DIMENSIONS || 768,
      llmModel: env.GROQ_LLM_MODEL || "openai/gpt-oss-120b",
      vectorProvider: "PostgreSQL Native Vector Store",
    };
  }
}

export const ragRepository = new RagRepository();
