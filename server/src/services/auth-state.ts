// ── Ported from lib/db/auth-state.ts — now using Prisma instead of MongoDB ──

import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
} from "@whiskeysockets/baileys";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";

export async function usePostgresAuthState(sessionId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const writeData = async (data: any, id: string) => {
    try {
      const serialized = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
      await prisma.sessionAuthState.upsert({
        where: { sessionId_keyId: { sessionId, keyId: id } },
        update: { value: serialized },
        create: { sessionId, keyId: id, value: serialized },
      });
    } catch (err) {
      logger.error({ err, sessionId, id }, "[AuthState] Error writing key");
    }
  };

  const readData = async (id: string) => {
    try {
      const doc = await prisma.sessionAuthState.findUnique({
        where: { sessionId_keyId: { sessionId, keyId: id } },
      });
      if (!doc || !doc.value) return null;
      return JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const removeData = async (id: string) => {
    try {
      await prisma.sessionAuthState.delete({
        where: { sessionId_keyId: { sessionId, keyId: id } },
      });
    } catch {}
  };

  const creds: AuthenticationCreds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: Record<string, any> = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<any>[] = [];
          const dataset = data as any;
          for (const category in dataset) {
            for (const id in dataset[category]) {
              const value = dataset[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, "creds"),
  };
}

export async function clearPostgresAuthState(sessionId: string): Promise<void> {
  try {
    await prisma.sessionAuthState.deleteMany({ where: { sessionId } });
  } catch (err) {
    logger.error({ err, sessionId }, "[AuthState] Error clearing auth state");
  }
}
