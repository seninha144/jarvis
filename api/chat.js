import { readFileSync } from "node:fs";

const PERSONALITY = readFileSync(new URL("../shared/personality.txt", import.meta.url), "utf8").trim();
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const MAX_BODY_BYTES = 32_000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOTAL_CHARS = 12_000;
const buckets = new Map();

function reply(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}
function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim() || request.headers["x-real-ip"] || request.socket?.remoteAddress || "unknown";
}
function rateLimited(ip) {
  const now = Date.now();
  const current = buckets.get(ip);
  if (!current || current.resetAt <= now) { buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  current.count += 1;
  return current.count > MAX_REQUESTS;
}
function validMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return false;
  let total = 0;
  for (const message of value) {
    if (!message || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") return false;
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) return false;
    total += content.length;
  }
  return total <= MAX_TOTAL_CHARS;
}

export default async function handler(request, response) {
  if (request.method === "GET") return reply(response, 200, { configured: Boolean(process.env.GEMINI_API_KEY), provider: "gemini", model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite" });
  if (request.method !== "POST") { response.setHeader("Allow", "GET, POST"); return reply(response, 405, { error: "Método não permitido." }); }
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) return reply(response, 413, { error: "Pedido demasiado grande." });
  if (rateLimited(clientIp(request))) return reply(response, 429, { error: "Limite temporário atingido. Tente novamente em um minuto." });
  const body = typeof request.body === "string" ? (() => { try { return JSON.parse(request.body); } catch { return null; } })() : request.body;
  if (!body || JSON.stringify(body).length > MAX_BODY_BYTES || !validMessages(body.messages)) return reply(response, 400, { error: "Pedido inválido." });
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  if (!apiKey) return reply(response, 503, { error: "J.A.R.V.I.S. ainda não está configurado." });
  if (!/^[A-Za-z0-9._-]+$/.test(model)) return reply(response, 500, { error: "Configuração de IA inválida." });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(GEMINI_BASE_URL + "/" + model + ":generateContent", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PERSONALITY }] },
        contents: body.messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content.trim() }] })),
        generationConfig: { maxOutputTokens: 1200 },
      }),
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 400;
      return reply(response, status, { error: status === 429 ? "Limite do serviço de IA atingido." : "O serviço de IA não conseguiu processar o pedido." });
    }
    const content = payload?.candidates?.flatMap((candidate) => candidate?.content?.parts || []).map((part) => part?.text || "").join("\n").trim();
    if (!content) return reply(response, 502, { error: "O serviço de IA devolveu uma resposta vazia." });
    return reply(response, 200, { content, model, provider: "gemini" });
  } catch (error) {
    return reply(response, error?.name === "AbortError" ? 504 : 502, { error: error?.name === "AbortError" ? "O pedido excedeu o tempo limite." : "Não foi possível contactar o serviço de IA." });
  } finally { clearTimeout(timeout); }
}