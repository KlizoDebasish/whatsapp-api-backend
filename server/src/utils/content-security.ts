// ── Ported from lib/gateway/content-security.ts ──

interface SecurityCheckResult {
  isSafe: boolean;
  violationType?: string;
  errorMessage: string;
}

const SQL_INJECTION_PATTERNS = [
  /\b(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|EXEC|EXECUTE|xp_|sp_)\b/i,
  /('|--|;|\/\*|\*\/|@@|@variable|\bOR\b\s+\d+=\d+|\bAND\b\s+\d+=\d+)/i,
  /(UNION\s+(ALL\s+)?SELECT)/i,
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore (previous|prior|all) (instructions|rules|prompts)/i,
  /you are now (a|an) (different|new|unrestricted)/i,
  /act as (DAN|jailbreak|unrestricted|evil|harmful)/i,
  /(system prompt|system instruction|previous context).*?(ignore|override|bypass)/i,
];

const HARMFUL_CONTENT_PATTERNS = [
  /\b(hack|exploit|malware|ransomware|phishing|keylogger)\b/i,
  /\b(bomb|explosive|weapon|assassination|terrorism)\b/i,
];

export function validateContentSafety(text: string): SecurityCheckResult {
  if (!text || text.trim().length === 0) {
    return { isSafe: true, errorMessage: "" };
  }

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isSafe: false,
        violationType: "sql_injection",
        errorMessage: "⚠️ Security: Your message contained patterns that may harm the database. Please rephrase your question.",
      };
    }
  }

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isSafe: false,
        violationType: "prompt_injection",
        errorMessage: "⚠️ Security: Instruction override attempts are not allowed. Please ask a legitimate business question.",
      };
    }
  }

  for (const pattern of HARMFUL_CONTENT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isSafe: false,
        violationType: "harmful_content",
        errorMessage: "⚠️ This request cannot be processed. Please ask about products, stock, sales, or business operations.",
      };
    }
  }

  return { isSafe: true, errorMessage: "" };
}
