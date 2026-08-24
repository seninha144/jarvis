import type { JarvisState } from "../types/jarvis";

export function StatusBar({ state, model }: { state: JarvisState; model: string }) {
  return (
    <footer className="status-bar">
      <span>JARVIS OS <b>01.00.00</b></span>
      <span>ENCRYPTION <b>AES-256</b></span>
      <span>MODEL <b>{model.toUpperCase()}</b></span>
      <span className="status-right">CORE STATE <b>{state.toUpperCase()}</b></span>
    </footer>
  );
}
