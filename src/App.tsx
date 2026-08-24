import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CommandInput } from "./components/CommandInput";
import { Conversation } from "./components/Conversation";
import { Header } from "./components/Header";
import { JarvisCore } from "./components/JarvisCore";
import { StatusBar } from "./components/StatusBar";
import { SystemPanel } from "./components/SystemPanel";
import { WELCOME_MESSAGE } from "./config/personality";
import { aiService } from "./services/ai";
import { AudioCaptureService } from "./services/audioCapture";
import { AudioPlaybackService } from "./services/audioPlayback";
import { BrowserSpeechRecognitionService } from "./services/browserSpeechRecognition";
import { BrowserSpeechSynthesisService } from "./services/browserSpeechSynthesis";
import { synthesizeLocalSpeech, synthesizeSpeech, transcribeAudio, transcribeLocalAudio } from "./services/voice";
import { recordingToWhisperWav } from "./services/audioWav";
import { runtime } from "./services/runtime";
import type { AIStatus, JarvisState, Message, VoiceStatus } from "./types/jarvis";

const welcome: Message = { id: "startup", role: "assistant", content: WELCOME_MESSAGE, timestamp: new Date() };
const defaultStatus: AIStatus = { configured: false, provider: "gemini", model: "gemini-3.1-flash-lite", sttProvider: runtime.isTauri ? "local" : "browser", ttsProvider: runtime.isTauri ? "local" : "browser", sttConfigured: false, ttsConfigured: runtime.isWeb && BrowserSpeechSynthesisService.isSupported() };

function App() {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [state, setState] = useState<JarvisState>("idle");
  const [status, setStatus] = useState<AIStatus>(defaultStatus);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("unavailable");
  const capture = useRef(new AudioCaptureService());
  const playback = useRef(new AudioPlaybackService());
  const recognition = useRef(new BrowserSpeechRecognitionService());
  const browserSpeech = useRef(new BrowserSpeechSynthesisService());

  useEffect(() => {
    aiService.getStatus().then((nextStatus) => {
      setStatus(nextStatus);
      const sttSupported = nextStatus.sttProvider === "browser"
        ? BrowserSpeechRecognitionService.isSupported()
        : AudioCaptureService.isSupported() && nextStatus.sttConfigured;
      const ttsSupported = nextStatus.ttsProvider === "browser"
        ? BrowserSpeechSynthesisService.isSupported()
        : nextStatus.ttsConfigured;
      setVoiceStatus(sttSupported && ttsSupported ? "online" : sttSupported || ttsSupported ? "limited" : "unavailable");
    }).catch(() => setStatus(defaultStatus)).finally(() => setStatusLoaded(true));
    return () => {
      capture.current.cancel();
      playback.current.stop();
      recognition.current.cancel();
      browserSpeech.current.cancel();
    };
  }, []);

  const apiHistory = useMemo(() => messages.filter((message) => message.id !== "startup" && !message.error && !message.pending)
    .map(({ role, content }) => ({ role, content })), [messages]);

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
    if (!status.ttsConfigured) return;
    try {
      setState("speaking");
      if (status.ttsProvider === "browser") await browserSpeech.current.speak(content);
      else if (status.ttsProvider === "local") await playback.current.play(await synthesizeLocalSpeech(content), "audio/wav");
      else await playback.current.play(await synthesizeSpeech(content));
      setState("idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Fala interrompida.") { setState("idle"); return; }
      setVoiceStatus("error");
      setState("error");
      addError(`VOICE: ${message}`);
      window.setTimeout(() => setState("idle"), 2500);
    }
  };

  const handleSubmit = async (content: string) => {
    if (status.ttsProvider === "browser") browserSpeech.current.unlock();
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content, timestamp: new Date() }]);
    setState("thinking");
    console.info(`[JARVIS] Sending request via ${status.provider}`);
    try {
      const response = await aiService.sendMessage([...apiHistory, { role: "user", content }]);
      if (!response.content.trim()) throw new Error("A resposta recebida estava vazia.");
      await revealResponse(response.content);
      await speakResponse(response.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState("error");
      addError(message);
      window.setTimeout(() => setState("idle"), 2500);
    }
  };

  const finishRecordedRecognition = async () => {
    const audio = await capture.current.stop();
    if (status.sttProvider === "local") {
      return (await transcribeLocalAudio(await recordingToWhisperWav(audio))).trim();
    }
    return (await transcribeAudio(audio)).text.trim();
  };

  const handleVoiceAction = async () => {
    if (state === "speaking") {
      if (status.ttsProvider === "browser") browserSpeech.current.cancel(); else playback.current.stop();
      setState("idle");
      return;
    }
    if (state === "listening") {
      if (status.sttProvider === "browser") recognition.current.stop();
      else {
        setState("thinking");
        try { await handleSubmit(await finishRecordedRecognition()); }
        catch (error) { handleVoiceError(error); }
      }
      return;
    }
    if (state !== "idle") return;
    try {
      setState("listening");
      console.info(`[JARVIS] Listening via ${status.sttProvider}`);
      if (status.sttProvider === "browser") {
        browserSpeech.current.unlock();
        const transcript = await recognition.current.listen("pt-BR");
        setState("thinking");
        await handleSubmit(transcript);
      } else {
        await capture.current.start();
      }
      setVoiceStatus("online");
    } catch (error) {
      handleVoiceError(error);
    }
  };

  const handleVoiceError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setVoiceStatus(message.includes("permissão") ? "blocked" : BrowserSpeechRecognitionService.isSupported() ? "error" : "limited");
    setState("error");
    addError(`VOICE: ${message}`);
    window.setTimeout(() => setState("idle"), 2500);
  };

  const busy = state === "thinking" || state === "speaking" || state === "listening";
  const voiceAvailable = status.sttConfigured && voiceStatus !== "unavailable" && voiceStatus !== "blocked" && voiceStatus !== "error";

  return (
    <main className="app-shell">
      <div className="grid-overlay" aria-hidden="true" />
      <div className="corner corner-tl"/><div className="corner corner-tr"/><div className="corner corner-bl"/><div className="corner corner-br"/>
      <Header />
      <div className="primary-layout">
        <SystemPanel runtimeTarget={runtime.target} aiConfigured={status.configured} aiProvider={status.provider} voiceProvider={status.sttProvider === status.ttsProvider ? status.sttProvider : undefined} voiceStatus={voiceStatus} />
        <div className="main-column">
          <JarvisCore state={state} />
          {statusLoaded && !status.configured && (
            <div className="connection-alert"><AlertTriangle size={15}/><div><strong>{status.provider.toUpperCase()} CONNECTION REQUIRED</strong><span>Configure the provider API key to activate JARVIS.</span></div></div>
          )}
          <Conversation messages={messages} />
          <CommandInput disabled={busy || !status.configured} state={state} voiceAvailable={voiceAvailable} onSubmit={handleSubmit} onVoiceAction={handleVoiceAction} />
        </div>
      </div>
      <StatusBar state={state} model={status.model} web={runtime.isWeb} />
    </main>
  );
}

export default App;