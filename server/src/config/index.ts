import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  WEBHOOK_URL: z.string().optional().default(""),
  WEBHOOK_NAME: z.string().default("Default Webhook"),
  WEBHOOK_SECRET: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_LLM_MODEL: z.string().default("gemini-3.7-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-2"),
  GEMINI_EMBEDDING_DIMENSIONS: z.coerce.number().default(768),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_LLM_MODEL: z.string().default("openai/gpt-oss-120b"),
  DASHBOARD_SECRET: z.string().default("changeme_internal_dashboard_secret"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  });
  process.exit(1);
}

export const config = {
  ...parsed.data,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(",").map((s) => s.trim()),
  isDev: parsed.data.NODE_ENV === "development",
  isProd: parsed.data.NODE_ENV === "production",
} as const;

export const env = config;
