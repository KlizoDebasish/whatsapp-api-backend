import { prisma } from "../../config/database";

export class ConfigRepository {
  async getAll(): Promise<Record<string, any>> {
    const configs = await prisma.systemConfig.findMany();
    const result: Record<string, any> = {};
    for (const c of configs) {
      result[c.key] = c.value;
    }
    return result;
  }

  async getValue(key: string): Promise<any> {
    const config = await prisma.systemConfig.findUnique({
      where: { key },
    });
    return config ? config.value : null;
  }

  async setValue(key: string, value: any): Promise<void> {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async setBulk(kvMap: Record<string, any>): Promise<void> {
    const ops = Object.entries(kvMap).map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    );
    await prisma.$transaction(ops);
  }
}

export const configRepository = new ConfigRepository();
