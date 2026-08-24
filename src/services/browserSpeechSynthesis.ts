export class BrowserSpeechSynthesisService {
  private resolveSpeech: (() => void) | null = null;
  private unlocked = false;
  static isSupported(): boolean { return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window; }
  get isSpeaking(): boolean { return window.speechSynthesis?.speaking ?? false; }
  unlock(): void {
    if (this.unlocked || !BrowserSpeechSynthesisService.isSupported()) return;
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    this.unlocked = true;
  }
  async speak(text: string, language = "pt-BR"): Promise<void> {
    if (!BrowserSpeechSynthesisService.isSupported()) throw new Error("A síntese de voz não é suportada neste ambiente.");
    this.cancel();
    const voices = await this.availableVoices();
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      this.resolveSpeech = resolve;
      utterance.lang = language;
      utterance.rate = 0.94;
      utterance.pitch = 0.88;
      utterance.volume = 1;
      utterance.voice = this.selectVoice(voices);
      utterance.onend = () => { this.cleanup(); resolve(); };
      utterance.onerror = (event) => { this.cleanup(); reject(new Error(event.error === "canceled" ? "Fala interrompida." : "A síntese de voz falhou.")); };
      window.speechSynthesis.speak(utterance);
    });
  }
  cancel(): void {
    const resolve = this.resolveSpeech;
    if (BrowserSpeechSynthesisService.isSupported()) window.speechSynthesis.cancel();
    this.cleanup();
    resolve?.();
  }
  private availableVoices(): Promise<SpeechSynthesisVoice[]> {
    const current = window.speechSynthesis.getVoices();
    if (current.length) return Promise.resolve(current);
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
      window.speechSynthesis.addEventListener("voiceschanged", () => {
        window.clearTimeout(timeout);
        resolve(window.speechSynthesis.getVoices());
      }, { once: true });
    });
  }
  private selectVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    const maleHints = /david|george|daniel|james|mark|ryan|male|masculin|homem|ricardo|duarte|antonio|carlos|felipe|paulo/i;
    const tier = (voice: SpeechSynthesisVoice): number => {
      const lang = voice.lang.replace("_", "-").toLowerCase();
      const male = maleHints.test(voice.name);
      if (lang === "pt-br" && male) return 4;
      if (lang === "pt-br") return 3;
      if (lang === "pt-pt") return 2;
      return 1;
    };
    return [...voices].sort((a, b) => {
      const difference = tier(b) - tier(a);
      if (difference) return difference;
      return Number(b.localService) - Number(a.localService);
    })[0] ?? null;
  }
  private cleanup(): void { this.resolveSpeech = null; }
}