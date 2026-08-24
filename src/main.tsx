import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { runtime } from "./services/runtime";

console.info("[JARVIS] Application started");

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);

if (runtime.isWeb && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      console.info("[JARVIS] PWA service worker unavailable.");
    });
  });
}