import crypto from "crypto";
import { apiKeysRepository } from "./api-keys.repository";
import { CreateApiKeyInput } from "./api-keys.schema";
import { NotFoundError } from "../../utils/errors";

export class ApiKeysService {
  async getAllApiKeys() {
    return apiKeysRepository.findAll();
  }

  async createApiKey(input: CreateApiKeyInput) {
    const rawKey = `wa_live_${crypto.randomBytes(24).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.substring(0, 12);

    const record = await apiKeysRepository.create({
      name: input.name,
      keyHash,
      keyPrefix,
      role: input.role || "user",
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    });

    return {
      ...record,
      rawKey, // Only returned once upon creation!
    };
  }

  async revokeApiKey(id: string) {
    const apiKey = await apiKeysRepository.findById(id);
    if (!apiKey) throw new NotFoundError(`API Key with ID ${id} not found`);

    await apiKeysRepository.delete(id);
    return { success: true, message: `API key ${id} revoked` };
  }
}

export const apiKeysService = new ApiKeysService();
