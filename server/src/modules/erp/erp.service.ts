import { erpRepository } from "./erp.repository";
import { processVoiceOrTextQuery } from "../../services/ai-erp-engine";
import { QueryErpInput, CreateErpLeadInput } from "./erp.schema";

export class ErpService {
  async processQuery(input: QueryErpInput) {
    return processVoiceOrTextQuery({
      sessionId: input.sessionId,
      chatId: input.chatId || "api_query",
      userText: input.query,
      voiceUrl: input.voiceUrl,
    });
  }

  async getProducts() {
    return erpRepository.getProducts();
  }

  async getLeads() {
    return erpRepository.getLeads();
  }

  async createLead(input: CreateErpLeadInput) {
    return erpRepository.createLead(input);
  }

  async getInventorySummary() {
    return erpRepository.getInventorySummary();
  }
}

export const erpService = new ErpService();
