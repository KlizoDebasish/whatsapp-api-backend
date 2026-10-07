import { configRepository } from "./config.repository";

export class ConfigService {
  async getConfig() {
    return configRepository.getAll();
  }

  async getValue(key: string) {
    return configRepository.getValue(key);
  }

  async updateConfig(key: string, value: any) {
    await configRepository.setValue(key, value);
    return configRepository.getAll();
  }

  async updateBulkConfig(kvMap: Record<string, any>) {
    await configRepository.setBulk(kvMap);
    return configRepository.getAll();
  }
}

export const configService = new ConfigService();
