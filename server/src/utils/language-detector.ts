// ── Ported from lib/utils/language-detector.ts ──

interface DetectedLanguage {
  code: string;
  name: string;
  confidence: number;
}

const SCRIPT_PATTERNS: Array<{ code: string; name: string; pattern: RegExp }> = [
  { code: "bn", name: "Bengali", pattern: /[\u0980-\u09FF]/ },
  { code: "hi", name: "Hindi", pattern: /[\u0900-\u097F]/ },
  { code: "ar", name: "Arabic", pattern: /[\u0600-\u06FF]/ },
  { code: "zh", name: "Chinese", pattern: /[\u4E00-\u9FFF]/ },
  { code: "ja", name: "Japanese", pattern: /[\u3040-\u30FF]/ },
  { code: "ko", name: "Korean", pattern: /[\uAC00-\uD7AF]/ },
  { code: "ru", name: "Russian", pattern: /[\u0400-\u04FF]/ },
  { code: "ta", name: "Tamil", pattern: /[\u0B80-\u0BFF]/ },
  { code: "te", name: "Telugu", pattern: /[\u0C00-\u0C7F]/ },
  { code: "gu", name: "Gujarati", pattern: /[\u0A80-\u0AFF]/ },
  { code: "mr", name: "Marathi", pattern: /[\u0900-\u097F]/ },
];

const ROMANIZED_PATTERNS: Array<{ code: string; name: string; words: string[] }> = [
  { code: "bn-Latn", name: "Banglish", words: ["ami", "tumi", "apni", "kemon", "achi", "bhai", "dada", "didi", "eta", "ota", "ki", "kothay", "boro", "choto", "dam", "stock", "pabo"] },
  { code: "hi-Latn", name: "Hinglish", words: ["kya", "hai", "hain", "nahi", "karo", "karna", "batao", "bhai", "yaar", "matlab", "abhi", "thoda", "bahut", "acha", "bol"] },
  { code: "es", name: "Spanish", words: ["hola", "gracias", "precio", "stock", "cuanto", "disponible", "tengo", "quiero", "necesito"] },
];

export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.trim().length < 2) {
    return { code: "en", name: "English", confidence: 0.5 };
  }

  for (const { code, name, pattern } of SCRIPT_PATTERNS) {
    if (pattern.test(text)) {
      return { code, name, confidence: 0.95 };
    }
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);

  for (const { code, name, words: langWords } of ROMANIZED_PATTERNS) {
    const matches = langWords.filter((w) => words.includes(w));
    if (matches.length >= 2) {
      return { code, name, confidence: 0.75 };
    }
  }

  return { code: "en", name: "English", confidence: 0.8 };
}
