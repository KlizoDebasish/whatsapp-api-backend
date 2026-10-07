// ── Ported from lib/gateway/browser-query-tool.ts ──

import { logger } from "./logger";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function executeWebSearch(
  query: string,
  maxResults = 3
): Promise<SearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const res = await fetch(ddgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WhatsApp-Gateway/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const html = await res.text();
    const results: SearchResult[] = [];

    const resultPattern =
      /class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>.*?class="result__snippet"[^>]*>(.*?)<\/span>/gs;
    let match;
    let count = 0;

    while ((match = resultPattern.exec(html)) !== null && count < maxResults) {
      const url = match[1].replace(/\\/g, "");
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const snippet = match[3].replace(/<[^>]+>/g, "").trim();
      if (url && title) {
        results.push({ title, url, snippet });
        count++;
      }
    }

    return results;
  } catch (err) {
    logger.warn({ err }, "[BrowserQueryTool] Web search failed");
    return [];
  }
}

export async function executeBrowsePage(
  url: string,
  maxLength = 2500
): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WhatsApp-Gateway/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return "";

    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, maxLength);

    return text;
  } catch (err) {
    logger.warn({ err, url }, "[BrowserQueryTool] Browse page failed");
    return "";
  }
}
