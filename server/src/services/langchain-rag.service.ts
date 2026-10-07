import { GoogleGenAI } from "@google/genai";
import { prisma } from "../config/database";
import { env } from "../config";
import { logger } from "../utils/logger";
import path from "path";

export interface RagChunkResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
}

/**
 * LangChain Recursive Character Text Splitter implementation
 */
export class RecursiveCharacterTextSplitter {
  private chunkSize: number;
  private chunkOverlap: number;
  private separators: string[];

  constructor(options?: { chunkSize?: number; chunkOverlap?: number; separators?: string[] }) {
    this.chunkSize = options?.chunkSize || 500;
    this.chunkOverlap = options?.chunkOverlap || 100;
    this.separators = options?.separators || ["\n\n", "\n", ". ", " ", ""];
  }

  public splitText(text: string): string[] {
    const finalChunks: string[] = [];
    if (!text) return finalChunks;

    let separator = this.separators[this.separators.length - 1];

    for (const s of this.separators) {
      if (s === "") {
        separator = s;
        break;
      }
      if (text.includes(s)) {
        separator = s;
        break;
      }
    }

    const splits = separator ? text.split(separator) : text.split("");

    let currentChunk: string[] = [];
    let currentLen = 0;

    for (const split of splits) {
      const piece = split + (separator || "");
      if (currentLen + piece.length > this.chunkSize && currentChunk.length > 0) {
        finalChunks.push(currentChunk.join("").trim());
        while (currentChunk.length > 0 && currentLen > this.chunkOverlap) {
          const removed = currentChunk.shift() || "";
          currentLen -= removed.length;
        }
      }
      currentChunk.push(piece);
      currentLen += piece.length;
    }

    if (currentChunk.length > 0) {
      finalChunks.push(currentChunk.join("").trim());
    }

    return finalChunks.filter((c) => c.length > 10);
  }
}

export class LangChainRagService {
  private ai: GoogleGenAI | null = null;
  private apiKey: string = "";
  private embeddingModel: string = "gemini-embedding-2";
  private embeddingDimensions: number = 768;
  private groqApiKey: string = "";
  private groqModel: string = "openai/gpt-oss-120b";
  private splitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.apiKey = (env.GEMINI_API_KEY || "").trim();
    this.embeddingModel = (env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2").trim();
    this.embeddingDimensions = Number(env.GEMINI_EMBEDDING_DIMENSIONS) || 768;
    this.groqApiKey = (env.GROQ_API_KEY || process.env.GROQ_API_KEY || "").trim();
    this.groqModel = (env.GROQ_LLM_MODEL || process.env.GROQ_LLM_MODEL || "openai/gpt-oss-120b").trim();

    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });
  }

  /**
   * Extract plain text from a DOCX buffer using mammoth.
   * mammoth properly handles ZIP Data Descriptors (compressedSize=0 in local headers).
   */
  private async extractDocxText(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = (result.value || "").trim();
    if (text.length === 0) {
      throw new Error("mammoth returned empty text — the DOCX may be empty or contain only images");
    }
    logger.info(`[RAG] mammoth extracted ${text.length} chars from DOCX`);
    return text;
  }

  /**
   * Universal Document Text Extractor — async, supports PDF, DOCX, MD, JSON, TXT
   */
  public async extractTextFromDocument(buffer: Buffer, filename: string): Promise<string> {
    const ext = path.extname(filename).toLowerCase();

    // 1. JSON
    if (ext === ".json") {
      try {
        const rawStr = buffer.toString("utf-8");
        const parsed = JSON.parse(rawStr);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return buffer.toString("utf-8");
      }
    }

    // 2. Markdown & Plain Text
    if (ext === ".md" || ext === ".txt") {
      return buffer.toString("utf-8").replace(/\r\n/g, "\n").trim();
    }

    // 3. Word Documents — use mammoth (handles all valid .docx ZIP formats)
    if (ext === ".docx" || ext === ".doc") {
      return await this.extractDocxText(buffer);
    }

    // 4. PDF — extract text from BT...ET content streams
    const rawBin = buffer.toString("binary");
    const pdfTexts: string[] = [];
    const btEtBlocks = rawBin.match(/BT[\s\S]*?ET/g) || [];
    for (const block of btEtBlocks) {
      const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g) || [];
      for (const tj of tjMatches) {
        const t = tj.replace(/\(([^)]*)\)\s*Tj/, "$1").replace(/\\/g, "").trim();
        if (t.length > 1) pdfTexts.push(t);
      }
      const tjArrMatches = block.match(/\[([^\]]*)\]\s*TJ/g) || [];
      for (const tjArr of tjArrMatches) {
        const parts = (tjArr.match(/\(([^)]*)\)/g) || [])
          .map((s) => s.slice(1, -1).replace(/\\/g, "").trim())
          .filter((s) => s.length > 0);
        if (parts.length) pdfTexts.push(parts.join(" "));
      }
    }
    if (pdfTexts.length > 0) {
      return pdfTexts.join(" ").replace(/\s+/g, " ").trim().substring(0, 100000);
    }

    // Plain-text PDF fallback
    return buffer
      .toString("utf-8")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 100000);
  }

  /**
   * Split document text into chunks using LangChain RecursiveCharacterTextSplitter
   */
  public async splitTextIntoChunks(text: string): Promise<string[]> {
    return this.splitter.splitText(text);
  }

  /**
   * Generate 768-dim Embedding vector using gemini-embedding-2 (Google AI Studio)
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      return this.generatePseudoEmbedding(text);
    }

    // 1. Primary: @google/genai SDK
    if (this.ai) {
      try {
        const response = await this.ai.models.embedContent({
          model: this.embeddingModel,
          contents: text,
          config: {
            outputDimensionality: this.embeddingDimensions,
          },
        });

        const values = response.embedding?.values;
        if (Array.isArray(values) && values.length > 0) {
          return values;
        }
      } catch (sdkErr: any) {
        logger.warn(
          `[RAG] @google/genai embedContent failed (${this.embeddingModel}): ${sdkErr?.message}`
        );
      }
    }

    // 2. Direct REST API call (compatible with Google AI Studio free tier)
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:embedContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${this.embeddingModel}`,
          content: { parts: [{ text }] },
          outputDimensionality: this.embeddingDimensions,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const values = data.embedding?.values;
        if (Array.isArray(values) && values.length > 0) {
          return values;
        }
      } else {
        const errText = await response.text();
        logger.warn(
          `[RAG] Embedding REST API error (${this.embeddingModel} HTTP ${response.status}): ${errText.substring(0, 200)}`
        );
      }
    } catch (err: any) {
      logger.warn(`[RAG] Embedding REST request failed: ${err?.message}`);
    }

    return this.generatePseudoEmbedding(text);
  }

  private generatePseudoEmbedding(text: string): number[] {
    const vector = new Array(768).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      vector[i % 768] = (vector[i % 768] + code / 255) % 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
    return vector.map((v) => v / norm);
  }

  /**
   * Cosine Similarity calculation between two 768-dim vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(vecA.length, vecB.length);
    for (let i = 0; i < len; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Fast Parallel Store Document and Chunks in PostgreSQL
   */
  public async indexDocument(
    filename: string,
    fileBuffer: Buffer,
    fileType?: string
  ): Promise<{ documentId: string; totalChunks: number }> {
    const detectedType = (fileType || path.extname(filename).replace(".", "") || "txt").toLowerCase();

    let text: string;
    try {
      text = await this.extractTextFromDocument(fileBuffer, filename);
    } catch (e) {
      logger.error({ e }, `[RAG] Text extraction failed for "${filename}"`);
      throw new Error(`Cannot extract text from "${filename}": ${(e as Error).message}`);
    }

    if (!text || text.trim().length < 10) {
      throw new Error(
        `Extracted text is empty for "${filename}". Ensure the file contains readable text (not just images).`
      );
    }

    logger.info(
      `[RAG] "${filename}" → ${text.length} chars extracted. Preview: "${text.substring(0, 200)}"`
    );

    const chunkTexts = await this.splitTextIntoChunks(text);
    logger.info(`[RAG] Split into ${chunkTexts.length} chunks`);

    const doc = await prisma.ragDocument.create({
      data: {
        filename,
        fileType: detectedType,
        fileSize: fileBuffer.length,
        totalChunks: chunkTexts.length,
        status: "processing",
      },
    });

    const batchSize = 5;
    for (let i = 0; i < chunkTexts.length; i += batchSize) {
      const batch = chunkTexts.slice(i, i + batchSize);
      const embeddings = await Promise.all(
        batch.map((chunkText) => this.generateEmbedding(chunkText))
      );

      const createOps = batch.map((chunkText, idx) =>
        prisma.ragChunk.create({
          data: {
            documentId: doc.id,
            chunkIndex: i + idx,
            content: chunkText,
            embedding: embeddings[idx],
            tokenCount: Math.ceil(chunkText.length / 4),
          },
        })
      );

      await prisma.$transaction(createOps);
    }

    await prisma.ragDocument.update({
      where: { id: doc.id },
      data: { status: "indexed" },
    });

    return { documentId: doc.id, totalChunks: chunkTexts.length };
  }

  /**
   * Perform Vector Similarity Search over PostgreSQL database
   */
  public async searchSimilarChunks(query: string, topK = 4): Promise<RagChunkResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const allChunks = await prisma.ragChunk.findMany({ include: { document: true } });

    if (allChunks.length === 0) return [];

    const scored = allChunks.map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentName: chunk.document.filename,
      content: chunk.content,
      similarity: Math.round(this.cosineSimilarity(queryEmbedding, chunk.embedding) * 100) / 100,
    }));

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  /**
   * Call Groq LLM using LangChain's ChatGroq with model openai/gpt-oss-120b
   */
  private async generateAnswerWithGroq(contextText: string, query: string): Promise<string> {
    const groqKey = this.groqApiKey || (process.env.GROQ_API_KEY || "").trim();
    if (!groqKey) {
      throw new Error("GROQ_API_KEY is not configured in .env");
    }

    const modelName = this.groqModel || (process.env.GROQ_LLM_MODEL || "openai/gpt-oss-120b").trim();

    // 1. Primary: Use LangChain's ChatGroq
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ChatGroq } = require("@langchain/groq");
      if (ChatGroq) {
        const chat = new ChatGroq({
          apiKey: groqKey,
          model: modelName,
          temperature: 0.2,
          maxTokens: 1024,
        });

        const messages = [
          {
            role: "system",
            content:
              "You are a helpful AI assistant with access to a knowledge base. Answer the user's question clearly, concisely, and completely using ONLY the provided document excerpts. Do not say 'based on the context' — answer directly in natural language.",
          },
          {
            role: "user",
            content: `DOCUMENT EXCERPTS:\n${contextText}\n\nUSER QUESTION:\n${query}\n\nWrite a complete, clear, human-readable answer in 2-5 sentences strictly based on the excerpts above:`,
          },
        ];

        logger.info(`[RAG] Invoking LangChain ChatGroq with model: ${modelName}`);
        const response = await chat.invoke(messages);
        const content =
          typeof response.content === "string"
            ? response.content
            : Array.isArray(response.content)
            ? response.content.map((p: any) => p.text || "").join("")
            : JSON.stringify(response.content);

        if (content && content.trim()) {
          logger.info(`[RAG] Response synthesized by LangChain ChatGroq (${content.trim().length} chars)`);
          return content.trim();
        }
      }
    } catch (langchainErr: any) {
      logger.warn(
        `[RAG] LangChain ChatGroq invoke failed or package loading error: ${langchainErr?.message}. Falling back to Groq API client.`
      );
    }

    // 2. Direct Groq API client with 30s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful AI assistant with access to a knowledge base. Answer the user's question clearly, concisely, and completely using ONLY the provided document excerpts. Do not say 'based on the context' — answer directly in natural language.",
            },
            {
              role: "user",
              content: `DOCUMENT EXCERPTS:\n${contextText}\n\nUSER QUESTION:\n${query}\n\nWrite a complete, clear, human-readable answer in 2-5 sentences strictly based on the excerpts above:`,
            },
          ],
          temperature: 0.2,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content?.trim() || "";
        if (text) {
          logger.info(`[RAG] Response synthesized by Groq API (${modelName}, ${text.length} chars)`);
          return text;
        }
      } else {
        const errBody = await response.text();
        throw new Error(`Groq API returned HTTP ${response.status}: ${errBody.substring(0, 200)}`);
      }
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      logger.error({ fetchErr }, `[RAG] Groq API call error (${modelName})`);
      throw fetchErr;
    }

    throw new Error(`Failed to generate answer from Groq with model ${modelName}`);
  }

  /**
   * LangChain RAG Runnable Chain:
   * WhatsApp Question
   * → Query Embedding (existing Gemini)
   * → pgvector similarity search
   * → Retrieved chunks
   * → LangChain ChatGroq
   * → openai/gpt-oss-120b
   * → Final RAG response
   */
  public async executeRagChain(query: string): Promise<{
    answer: string;
    retrievedChunks: RagChunkResult[];
    ragExecuted: boolean;
  }> {
    // Step 1: Retrieve top chunks by cosine similarity using existing Gemini embedding
    const allTopChunks = await this.searchSimilarChunks(query, 6);

    if (allTopChunks.length === 0) {
      return {
        answer: "No documents found in the knowledge base. Please upload a document first.",
        retrievedChunks: [],
        ragExecuted: false,
      };
    }

    // Take top 4 chunks
    const relevantChunks = allTopChunks.slice(0, 4);

    // Step 2: Build context from retrieved chunks
    const contextText = relevantChunks
      .map((c, i) => `=== Excerpt ${i + 1} (Source: ${c.documentName}) ===\n${c.content}`)
      .join("\n\n");

    // Step 3: Call LangChain ChatGroq (openai/gpt-oss-120b)
    let answer = "";
    try {
      answer = await this.generateAnswerWithGroq(contextText, query);
    } catch (e: any) {
      logger.error({ e }, `[RAG] Groq response generation failed: ${e?.message}`);
      // Clean fallback presenting top chunk content directly if Groq key or network fails
      answer = relevantChunks
        .slice(0, 2)
        .map((c) => c.content)
        .join("\n\n")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!answer) answer = "Could not generate an answer. Please verify your GROQ_API_KEY in .env.";
    }

    return { answer, retrievedChunks: relevantChunks, ragExecuted: true };
  }

  /**
   * Regenerate embeddings for all existing chunks in PostgreSQL using gemini-embedding-2 (768 dimensions)
   */
  public async regenerateAllEmbeddings(): Promise<{ totalUpdated: number }> {
    logger.info(
      `[RAG] Regenerating embeddings with ${this.embeddingModel} (${this.embeddingDimensions} dims)...`
    );
    const allChunks = await prisma.ragChunk.findMany({
      select: { id: true, content: true },
    });

    if (allChunks.length === 0) {
      return { totalUpdated: 0 };
    }

    const batchSize = 5;
    let totalUpdated = 0;

    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const embeddings = await Promise.all(
        batch.map((chunk) => this.generateEmbedding(chunk.content))
      );

      const updateOps = batch.map((chunk, idx) =>
        prisma.ragChunk.update({
          where: { id: chunk.id },
          data: {
            embedding: embeddings[idx],
          },
        })
      );

      await prisma.$transaction(updateOps);
      totalUpdated += batch.length;
      logger.info(`[RAG] Regenerated embeddings: ${totalUpdated}/${allChunks.length} chunks`);
    }

    logger.info(`[RAG] Finished regenerating ${totalUpdated} embeddings.`);
    return { totalUpdated };
  }
}

export const langchainRagService = new LangChainRagService();

