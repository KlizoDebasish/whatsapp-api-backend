import Redis from "ioredis";
import { config } from "./index";
import { logger } from "../utils/logger";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 5000);
        logger.warn(`Redis reconnecting... attempt ${times}, delay ${delay}ms`);
        return delay;
      },
      lazyConnect: true,
    });

    redisClient.on("connect", () => logger.info("✅ Redis connected"));
    redisClient.on("error", (err) => logger.error({ err }, "Redis error"));
    redisClient.on("close", () => logger.warn("Redis connection closed"));
  }
  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info("Redis disconnected");
  }
}

/** Separate connection for BullMQ (it needs its own instance) */
export function createBullMQRedisConnection(): Redis {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
