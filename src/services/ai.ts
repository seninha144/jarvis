import { invoke } from "@tauri-apps/api/core";
import type { AIStatus, ApiMessage, AssistantResponse } from "../types/jarvis";
import { runtime } from "./runtime";

export interface AIProvider {
  getStatus(): Promise<AIStatus>;
  sendMessage(messages: ApiMessage[]): Promise<AssistantResponse>;
}

const webFallbackStatus: AIStatus = {
  configured: false,
  provider: "gemini",
  model: "gemini-3.1-flash-lite",
  sttProvider: "browser",
  ttsProvider: "browser",
  sttConfigured: false,
  ttsConfigured: typeof window !== "undefined" && "speechSynthesis" in window,
};

class DesktopAIProvider implements AIProvider {
  getStatus(): Promise<AIStatus> { return invoke<AIStatus>("get_ai_status"); }
  sendMessage(messages: ApiMessage[]): Promise<AssistantResponse> {
    return invoke<AssistantResponse>("send_message", { messages });
  }
}

class WebAIProvider implements AIProvider {
  async getStatus(): Promise<AIStatus> {
    try {
      const response = await fetch("/api/chat", { headers: { Accept: "application/json" } });
      if (!response.ok) return webFallbackStatus;
      const status = await response.json() as Pick<AIStatus, "configured" | "provider" | "model">;
      return {
        ...webFallbackStatus,
        ...status,
        sttConfigured: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
        ttsConfigured: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
      };
    } catch { return webFallbackStatus; }
  }

  async sendMessage(messages: ApiMessage[]): Promise<AssistantResponse> {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ messages }),
    });
    const payload = await response.json().catch(() => ({ error: "O servidor devolveu uma resposta inválida." })) as AssistantResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Não foi possível contactar o J.A.R.V.I.S.");
    return payload;
  }
}

export const aiService: AIProvider = runtime.isTauri ? new DesktopAIProvider() : new WebAIProvider();