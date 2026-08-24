interface SpeechRecognitionAlternativeLike { transcript: string; confidence: number; }
interface SpeechRecognitionResultLike { readonly length: number; readonly isFinal: boolean; [index: number]: SpeechRecognitionAlternativeLike; }
interface SpeechRecognitionResultListLike { readonly length: number; [index: number]: SpeechRecognitionResultLike; }
interface SpeechRecognitionEventLike extends Event { readonly results: SpeechRecognitionResultListLike; }
interface SpeechRecognitionErrorEventLike extends Event { readonly error: string; }
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export class BrowserSpeechRecognitionService {
  private recognition: SpeechRecognitionLike | null = null;
  private transcript = "";
  private reject: ((error: Error) => void) | null = null;

  static isSupported(): boolean { return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition); }
  get isListening(): boolean { return this.recognition !== null; }

  listen(language = "pt-BR"): Promise<string> {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) return Promise.reject(new Error("O reconhecimento de voz não é suportado neste ambiente."));
    if (this.recognition) return Promise.reject(new Error("O reconhecimento de voz já está ativo."));
    this.transcript = "";
    this.recognition = new Constructor();
    this.recognition.lang = language;
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    return new Promise<string>((resolve, reject) => {
      this.reject = reject;
      if (!this.recognition) return reject(new Error("Não foi possível iniciar o reconhecimento de voz."));
      this.recognition.onresult = (event) => {
        let text = "";
        for (let i = 0; i < event.results.length; i += 1) text += event.results[i][0]?.transcript ?? "";
        this.transcript = text.trim();
      };
      this.recognition.onerror = (event) => this.fail(this.mapError(event.error));
      this.recognition.onend = () => {
        const text = this.transcript.trim();
        this.cleanup();
        if (text) resolve(text); else reject(new Error("Não foi possível detetar fala."));
      };
      try { this.recognition.start(); } catch { this.fail(new Error("Não foi possível iniciar o reconhecimento de voz.")); }
    });
  }

  stop(): void { this.recognition?.stop(); }
  cancel(): void {
    const reject = this.reject;
    this.recognition?.abort();
    this.cleanup();
    reject?.(new Error("Reconhecimento cancelado."));
  }

  private fail(error: Error): void { const reject = this.reject; this.cleanup(); reject?.(error); }
  private cleanup(): void { this.recognition = null; this.reject = null; }
  private mapError(code: string): Error {
    if (code === "not-allowed" || code === "service-not-allowed") return new Error("A permissão do microfone foi bloqueada.");
    if (code === "audio-capture") return new Error("Nenhum microfone disponível.");
    if (code === "no-speech") return new Error("Não foi possível detetar fala.");
    if (code === "network") return new Error("O serviço de reconhecimento de voz está indisponível.");
    return new Error("O reconhecimento de voz falhou.");
  }
}