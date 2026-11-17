import { z } from "zod";
import type { ToolDefinition } from "@pocket/core";

/** Zod → JSON Schema, with the bits providers dislike removed. */
export function params(schema: z.ZodType): Record<string, unknown> {
  try {
    const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
    delete json.$schema;
    return json;
  } catch {
    return { type: "object", properties: {} };
  }
}

/** Define a tool and derive its JSON schema automatically. */
export function defineTool<I>(
  tool: Omit<ToolDefinition<I>, "parameters">,
): ToolDefinition<I> {
  return { ...tool, parameters: params(tool.schema) };
}

const BLOCKED_HOSTS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /^\[?fc00:/i,
  /^\[?fe80:/i,
  /\.local$/i,
  /\.internal$/i,
];

export function assertPublicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.some((r) => r.test(host))) {
    throw new Error(`Blocked host: ${host} (private or loopback address).`);
  }
  return url;
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title: decodeEntities(title), text };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export async function readLimited(res: Response, maxBytes = 2_000_000): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let out = "";
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (size >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return out;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
