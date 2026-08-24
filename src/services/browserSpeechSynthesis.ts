export const WEB_VOICE_STORAGE_KEY = "jarvis-web-voice";

export const MALE_VOICE_NAME_HINTS = [
  "Antonio", "Antônio", "Daniel", "Felipe", "Ricardo", "Paulo", "João",
  "Male", "Masculino", "Homem", "Guy", "David", "Mark", "Thomas",
  "George", "Alex", "James", "Ryan", "Carlos", "Duarte",
] as const;

let lastLoggedSignature = "";

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isLikelyMaleVoice(voice: Pick<SpeechSynthesisVoice, "name">): boolean {
  const name = normalized(voice.name);
  return MALE_VOICE_NAME_HINTS.some((hint) => name.includes(normalized(hint)));
}

function normalizedLanguage(voice: Pick<SpeechSynthesisVoice, "lang">): string {
  return voice.lang.replace("_", "-").toLowerCase();
}

export function automaticVoicePriority(voice: SpeechSynthesisVoice): number {
  const language = normalizedLanguage(voice);
  const male = isLikelyMaleVoice(voice);
  let tier = 0;
  if (male && language === "pt-br") tier = 6;
  else if (male && language === "pt-pt") tier = 5;
  else if (male && (language === "en-us" || language === "en-gb")) tier = 4;
  else if (language === "pt-br") tier = 3;
  else if (language === "pt-pt") tier = 2;
  else if (voice.default) tier = 1;
  return tier * 100 + Number(voice.localService) * 10 + Number(/natural|neural|online/i.test(voice.name));
}

export function voiceStorageId(voice: SpeechSynthesisVoice): string {
  return voice.voiceURI || voice.name + "|" + voice.lang;
}

export function getSavedWebVoiceId(): string {
  try { return window.localStorage.getItem(WEB_VOICE_STORAGE_KEY) ?? ""; }
  catch { return ""; }
}

export function saveWebVoiceId(id: string): void {
  try {
    if (id) window.localStorage.setItem(WEB_VOICE_STORAGE_KEY, id);
    else window.localStorage.removeItem(WEB_VOICE_STORAGE_KEY);
  } catch {
    if (import.meta.env.DEV) console.info("[JARVIS WEB VOICE] localStorage unavailable; using automatic selection.");
  }
}

export function selectBestWebVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const saved = getSavedWebVoiceId();
  const manual = saved ? voices.find((voice) => voiceStorageId(voice) === saved) : undefined;
  if (manual) return manual;
  return [...voices].sort((a, b) => automaticVoicePriority(b) - automaticVoicePriority(a))[0] ?? null;
}

export function logAvailableWebVoices(voices: SpeechSynthesisVoice[], selected?: SpeechSynthesisVoice | null): void {
  if (!import.meta.env.DEV) return;
  const signature = voices.map((voice) => voiceStorageId(voice)).join("\n");
  if (signature !== lastLoggedSignature) {
    lastLoggedSignature = signature;
    const list = voices.length
      ? voices.map((voice) => "- " + voice.name + " / " + voice.lang).join("\n")
      : "- nenhuma voz disponibilizada pelo navegador";
    console.info("[JARVIS WEB VOICE] available voices:\n" + list);
  }
  if (selected) {
    console.info("[JARVIS WEB VOICE] selected: " + selected.name + " / " + selected.lang);
    if (!isLikelyMaleVoice(selected)) console.info("[JARVIS WEB VOICE] no recognized male alternative available; using safe language fallback.");
  }
}

export function loadWebVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!BrowserSpeechSynthesisService.isSupported()) return Promise.resolve([]);
  return new Promise((resolve) => {
    let finished = false;
    let settleTimer: number | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(hardTimeout);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      window.speechSynthesis.removeEventListener("voiceschanged", changed);
      const voices = window.speechSynthesis.getVoices();
      logAvailableWebVoices(voices);
      resolve(voices);
    };
    const changed = () => {
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(finish, 180);
    };
    const hardTimeout = window.setTimeout(finish, timeoutMs);
    window.speechSynthesis.addEventListener("voiceschanged", changed);
    const initial = window.speechSynthesis.getVoices();
    if (initial.length) settleTimer = window.setTimeout(finish, 350);
  });
}
export class BrowserSpeechSynthesisService {
  private resolveSpeech: (() => void) | null = null;
  private unlocked = false;

  static isSupported(): boolean {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  get isSpeaking(): boolean {
    return window.speechSynthesis?.speaking ?? false;
  }

  unlock(): void {
    if (this.unlocked || !BrowserSpeechSynthesisService.isSupported()) return;
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    this.unlocked = true;
  }

  async speak(text: string, language = "pt-BR"): Promise<void> {
    if (!BrowserSpeechSynthesisService.isSupported()) {
      throw new Error("A síntese de voz não é suportada neste ambiente.");
    }
    this.cancel();
    const voices = await loadWebVoices();
    const selected = selectBestWebVoice(voices);
    logAvailableWebVoices(voices, selected);
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      this.resolveSpeech = resolve;
      utterance.lang = selected?.lang || language;
      utterance.rate = 0.94;
      utterance.pitch = 0.88;
      utterance.volume = 1;
      utterance.voice = selected;
      utterance.onend = () => { this.cleanup(); resolve(); };
      utterance.onerror = (event) => {
        this.cleanup();
        reject(new Error(event.error === "canceled" ? "Fala interrompida." : "A síntese de voz falhou."));
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  cancel(): void {
    const resolve = this.resolveSpeech;
    if (BrowserSpeechSynthesisService.isSupported()) window.speechSynthesis.cancel();
    this.cleanup();
    resolve?.();
  }

  private cleanup(): void {
    this.resolveSpeech = null;
  }
}
