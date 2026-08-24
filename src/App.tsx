import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CommandInput } from "./components/CommandInput";
import { Conversation } from "./components/Conversation";
import { Header } from "./components/Header";
import { JarvisCore } from "./components/JarvisCore";
import { StatusBar } from "./components/StatusBar";
import { SystemPanel } from "./components/SystemPanel";
import { WELCOME_MESSAGE } from "./config/personality";
import { AudioCaptureService } from "./services/audioCapture";
import { AudioPlaybackService } from "./services/audioPlayback";
import { getOpenAIStatus, sendToJarvis } from "./services/openai";
import { synthesizeSpeech, transcribeAudio } from "./services/voice";
import type { JarvisState, Message, OpenAIStatus, VoiceStatus } from "./types/jarvis";

const welcome: Message = { id: "startup", role: "assistant", content: WELCOME_MESSAGE, timestamp: new Date() };

function App() {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [state, setState] = useState<JarvisState>("idle");
  const [status, setStatus] = useState<OpenAIStatus>({ configured: false, model: "gpt-5.6" });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(AudioCaptureService.isSupported() ? "online" : "unavailable");
  const capture = useRef(new AudioCaptureService());
  const playback = useRef(new AudioPlaybackService());

  useEffect(() => {
    getOpenAIStatus().then((nextStatus) => {
      setStatus(nextStatus);
      if (!nextStatus.configured) setVoiceStatus("unavailable");
    }).catch(() => {
      setStatus({ configured: false, model: "gpt-5.6" });
      setVoiceStatus("unavailable");
    }).finally(() => setStatusLoaded(true));
    return () => { capture.current.cancel(); playback.current.stop(); };
  }, []);

  const apiHistory = useMemo(() => messages.filter((m) => m.id !== "startup" && !m.error && !m.pending).map(({ role, content }) => ({ role, content })), [messages]);

  const addError = (content: string) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content, timestamp: new Date(), error: true }]);
  };

  const revealResponse = async (content: string) => {
    const responseId = crypto.randomUUID();
    setMessages((current) => [...current, { id: responseId, role: "assistant", content: "", timestamp: new Date(), pending: true }]);
    const chunks = content.match(/.{1,4}/gs) ?? [content];
    for (let i = 0; i < chunks.length; i += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
      setMessages((current) => current.map((message) => message.id === responseId
        ? { ...message, content: message.content + chunks[i], pending: i < chunks.length - 1 }
        : message));
    }
  };

  const speakResponse = async (content: string) => {
    try {
      const audio = await synthesizeSpeech(content);
      setState("speaking");
      await playback.current.play(audio);
      setState("idle");
    } catch (error) {
      const content = error instanceof Error ? error.message : String(error);
      setVoiceStatus("error");
      setState("error");
      addError(`VOICE: ${content}`);
      window.setTimeout(() => setState("idle"), 2500);
    }
  };

  const handleSubmit = async (content: string) => {
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content, timestamp: new Date() };
    setMessages((current) => [...current, userMessage]);
    setState("thinking");
    console.info("[JARVIS] Sending request");
    try {
      const response = await sendToJarvis([...apiHistory, { role: "user", content }]);
      if (!response.content.trim()) throw new Error("A resposta recebida estava vazia.");
      console.info("[JARVIS] Response received");
      await revealResponse(response.content);
      await speakResponse(response.content);
    } catch (error) {
      const content = error instanceof Error ? error.message : String(error);
      setState("error");
      addError(content);
      window.setTimeout(() => setState("idle"), 2500);
    }
  };

  const handleVoiceAction = async () => {
    if (state === "speaking") {
      playback.current.stop();
      setState("idle");
      return;
    }
    if (state === "listening") {
      setState("thinking");
      try {
        const audio = await capture.current.stop();
        console.info(`[JARVIS] Recording captured (${Math.round(audio.durationMs)} ms)`);
        const transcription = await transcribeAudio(audio);
        if (!transcription.text.trim()) throw new Error("Não foi possível detetar fala na gravação.");
        setVoiceStatus("online");
        await handleSubmit(transcription.text.trim());
      } catch (error) {
        const content = error instanceof Error ? error.message : String(error);
        setVoiceStatus("error");
        setState("error");
        addError(`VOICE: ${content}`);
        window.setTimeout(() => setState("idle"), 2500);
      }
      return;
    }
    if (state !== "idle") return;
    try {
      await capture.current.start();
      setVoiceStatus("online");
      setState("listening");
      console.info("[JARVIS] Microphone listening");
    } catch (error) {
      const content = error instanceof Error ? error.message : String(error);
      setVoiceStatus(content.includes("permissão") ? "blocked" : "error");
      setState("error");
      addError(`VOICE: ${content}`);
      window.setTimeout(() => setState("idle"), 2500);
    }
  };

  const busy = state === "thinking" || state === "speaking" || state === "listening";

  return (
    <main className="app-shell">
      <div className="grid-overlay" aria-hidden="true" />
      <div className="corner corner-tl"/><div className="corner corner-tr"/><div className="corner corner-bl"/><div className="corner corner-br"/>
      <Header />
      <div className="primary-layout">
        <SystemPanel aiConfigured={status.configured} voiceStatus={voiceStatus} />
        <div className="main-column">
          <JarvisCore state={state} />
          {statusLoaded && !status.configured && (
            <div className="connection-alert"><AlertTriangle size={15}/><div><strong>OPENAI CONNECTION REQUIRED</strong><span>Configure your API key to activate JARVIS.</span></div></div>
          )}
          <Conversation messages={messages} />
          <CommandInput disabled={busy || !status.configured} state={state} voiceAvailable={status.configured && voiceStatus !== "unavailable" && voiceStatus !== "blocked"} onSubmit={handleSubmit} onVoiceAction={handleVoiceAction} />
        </div>
      </div>
      <StatusBar state={state} model={status.model} />
    </main>
  );
}

export default App;