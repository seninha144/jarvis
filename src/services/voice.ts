import { invoke } from "@tauri-apps/api/core";
import type { TranscriptionResponse } from "../types/jarvis";
import type { RecordedAudio } from "./audioCapture";

const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function transcribeAudio(audio: RecordedAudio): Promise<TranscriptionResponse> {
  if (!isTauri()) throw new Error("A transcrição segura requer o aplicativo desktop.");
  return invoke<TranscriptionResponse>("transcribe_audio", { audio: audio.bytes, mimeType: audio.mimeType });
}

export async function synthesizeSpeech(text: string): Promise<number[]> {
  if (!isTauri()) throw new Error("A síntese de voz segura requer o aplicativo desktop.");
  return invoke<number[]>("synthesize_speech", { text });
}