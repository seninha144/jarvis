export type RuntimeTarget = "tauri" | "web";
const tauriDetected = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const runtime = Object.freeze({
  target: (tauriDetected ? "tauri" : "web") as RuntimeTarget,
  isTauri: tauriDetected,
  isWeb: !tauriDetected,
});