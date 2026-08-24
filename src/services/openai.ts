import { invoke } from "@tauri-apps/api/core";
import type { ApiMessage, AssistantResponse, OpenAIStatus } from "../types/jarvis";

const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function getOpenAIStatus(): Promise<OpenAIStatus> {
  if (!isTauri()) return { configured: false, model: "gpt-5.6" };
  return invoke<OpenAIStatus>("get_openai_status");
}

export async function sendToJarvis(messages: ApiMessage[]): Promise<AssistantResponse> {
  if (!isTauri()) {
    throw new Error("O assistente requer o aplicativo desktop Tauri para proteger a API key.");
  }
  return invoke<AssistantResponse>("ask_jarvis", { messages });
}
