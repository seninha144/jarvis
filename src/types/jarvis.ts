export type JarvisState = "idle" | "listening" | "thinking" | "speaking" | "error";
export type VoiceStatus = "online" | "blocked" | "error" | "unavailable";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  pending?: boolean;
  error?: boolean;
}

export interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface OpenAIStatus {
  configured: boolean;
  model: string;
}

export interface AssistantResponse {
  content: string;
  model: string;
}

export interface TranscriptionResponse {
  text: string;
  model: string;
}

export type SystemLevel = "online" | "connected" | "unavailable" | "locked";

export interface SystemItem {
  label: string;
  value: string;
  level: SystemLevel;
}