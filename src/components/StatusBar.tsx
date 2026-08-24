import type { JarvisState } from "../types/jarvis";
import { WebVoiceSelector } from "./WebVoiceSelector";

export function StatusBar({ state, model, web = false }: { state: JarvisState; model: string; web?: boolean }) {
  return (
    <footer className="status-bar">
      <span>JARVIS OS <b>01.00.00</b></span>
      <span>ENCRYPTION <b>AES-256</b></span>
      <span>MODEL <b>{model.toUpperCase()}</b></span>
      {web && <WebVoiceSelector />}
      <span className="status-right">CORE STATE <b>{state.toUpperCase()}</b></span>
    </footer>
  );
}
