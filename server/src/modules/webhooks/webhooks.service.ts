import { webhooksRepository } from "./webhooks.repository";
import { CreateWebhookConfigInput, UpdateWebhookConfigInput } from "./webhooks.schema";
import { NotFoundError } from "../../utils/errors";
import { dispatchWebhook } from "../../services/webhook-dispatcher";

export class WebhooksService {
  async getAllConfigs() {
    return webhooksRepository.findAllConfigs();
  }

  async getConfigById(id: string) {
    const config = await webhooksRepository.findConfigById(id);
    if (!config) throw new NotFoundError(`Webhook config ${id} not found`);
    return config;
  }

  async createConfig(input: CreateWebhookConfigInput) {
    return webhooksRepository.createConfig(input);
  }

  async updateConfig(id: string, input: UpdateWebhookConfigInput) {
    await this.getConfigById(id);
    return webhooksRepository.updateConfig(id, input);
  }

  async deleteConfig(id: string) {
    await this.getConfigById(id);
    await webhooksRepository.deleteConfig(id);
    return { success: true, message: `Webhook config ${id} deleted` };
  }

  async testWebhook(id: string) {
    const config = await this.getConfigById(id);
    await dispatchWebhook({
      event: "webhook.test",
      timestamp: new Date().toISOString(),
      sessionId: "wa_primary_01",
      data: { message: "Test webhook payload from Gateway" },
    });
    return { success: true, message: `Test webhook dispatched to ${config.url}` };
  }

  async getLogs(limit?: number) {
    return webhooksRepository.findLogs(limit);
  }
}

export const webhooksService = new WebhooksService();
