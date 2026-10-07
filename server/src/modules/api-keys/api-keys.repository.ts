import { prisma } from "../../config/database";
import { ApiKey } from "@prisma/client";

export class ApiKeysRepository {
  async findAll(): Promise<ApiKey[]> {
    return prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string): Promise<ApiKey | null> {
    return prisma.apiKey.findUnique({
      where: { id },
    });
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    return prisma.apiKey.findUnique({
      where: { keyHash },
    });
  }

  async create(data: {
    name: string;
    keyHash: string;
    keyPrefix: string;
    role: string;
    expiresAt?: Date;
  }): Promise<ApiKey> {
    return prisma.apiKey.create({
      data: {
        name: data.name,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        role: data.role,
        expiresAt: data.expiresAt || null,
      },
    });
  }

  async delete(id: string): Promise<ApiKey> {
    return prisma.apiKey.delete({
      where: { id },
    });
  }

  async updateLastUsed(id: string): Promise<ApiKey> {
    return prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }
}

export const apiKeysRepository = new ApiKeysRepository();
