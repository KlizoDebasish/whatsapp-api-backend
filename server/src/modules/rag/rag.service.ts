import { ragRepository } from "./rag.repository";
import { langchainRagService } from "../../services/langchain-rag.service";
import { NotFoundError } from "../../utils/errors";

export class RagModuleService {
  async getDocuments() {
    return ragRepository.getDocuments();
  }

  async getDocumentDetails(id: string) {
    const doc = await ragRepository.getDocumentById(id);
    if (!doc) throw new NotFoundError(`Document ${id} not found`);
    return doc;
  }

  async processAndIndexDocument(filename: string, buffer: Buffer, fileType = "pdf") {
    return langchainRagService.indexDocument(filename, buffer, fileType);
  }

  async deleteDocument(id: string) {
    await this.getDocumentDetails(id);
    await ragRepository.deleteDocument(id);
    return { success: true, message: `Document ${id} deleted` };
  }

  async executeQuery(query: string) {
    return langchainRagService.executeRagChain(query);
  }

  async regenerateEmbeddings() {
    return langchainRagService.regenerateAllEmbeddings();
  }

  async getStats() {
    return ragRepository.getStats();
  }
}

export const ragModuleService = new RagModuleService();
