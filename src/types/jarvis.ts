export type JarvisState = "idle" | "listening" | "thinking" | "speaking" | "error";
export type VoiceStatus = "online" | "blocked" | "error" | "limited" | "unavailable";
export type AIProviderName = "gemini" | "openai" | "local";
export type VoiceProviderName = "local" | "browser" | "openai";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  pending?: boolean;
  error?: boolean;
}

export interface ApiMessage { role: "user" | "assistant"; content: string; }

export interface AIStatus {
  configured: boolean;
  provider: AIProviderName;
  model: string;
  sttProvider: VoiceProviderName;
  ttsProvider: VoiceProviderName;
  sttConfigured: boolean;
  ttsConfigured: boolean;
}

export interface AssistantResponse { content: string; model: string; provider: AIProviderName; }
export interface TranscriptionResponse { text: string; model: string; }
export type SystemLevel = "online" | "connected" | "unavailable" | "locked";
export interface SystemItem { label: string; value: string; level: SystemLevel; }