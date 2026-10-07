import { prisma } from "../../config/database";
import { WebhookConfig, WebhookLog } from "@prisma/client";

export class WebhooksRepository {
  async findAllConfigs(): Promise<WebhookConfig[]> {
    return prisma.webhookConfig.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async findConfigById(id: string): Promise<WebhookConfig | null> {
    return prisma.webhookConfig.findUnique({
      where: { id },
    });
  }

  async createConfig(data: {
    url: string;
    events: string[];
    secret?: string;
    enabled?: boolean;
  }): Promise<WebhookConfig> {
    return prisma.webhookConfig.create({
      data: {
        url: data.url,
        events: data.events,
        secret: data.secret || null,
        enabled: data.enabled ?? true,
      },
    });
  }

  async updateConfig(id: string, data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    return prisma.webhookConfig.update({
      where: { id },
      data,
    });
  }

  async deleteConfig(id: string): Promise<WebhookConfig> {
    return prisma.webhookConfig.delete({
      where: { id },
    });
  }

  async findLogs(limit = 100): Promise<WebhookLog[]> {
    return prisma.webhookLog.findMany({
      orderBy: { timestamp: "desc" },
      take: limit,
    });
  }
}

export const webhooksRepository = new WebhooksRepository();
