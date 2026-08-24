export interface RecordedAudio {
  bytes: number[];
  mimeType: string;
  durationMs: number;
}

const MIN_RECORDING_MS = 500;

function preferredMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export class AudioCaptureService {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  static isSupported(): boolean {
    return typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
  }

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  async start(): Promise<void> {
    if (!AudioCaptureService.isSupported()) throw new Error("Este dispositivo não suporta captura de áudio.");
    if (this.isRecording) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") throw new Error("A permissão do microfone foi bloqueada.");
      if (name === "NotFoundError") throw new Error("Nenhum microfone foi encontrado.");
      if (name === "NotReadableError" || name === "AbortError") throw new Error("O microfone está ocupado por outra aplicação.");
      throw new Error("Não foi possível iniciar o microfone.");
    }

    this.chunks = [];
    const mimeType = preferredMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (event) => { if (event.data.size > 0) this.chunks.push(event.data); };
    this.startedAt = performance.now();
    this.recorder.start(250);
  }

  stop(): Promise<RecordedAudio> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return Promise.reject(new Error("Nenhuma gravação está ativa."));
    return new Promise((resolve, reject) => {
      recorder.onerror = () => { this.cleanup(); reject(new Error("A gravação de áudio falhou.")); };
      recorder.onstop = async () => {
        const durationMs = performance.now() - this.startedAt;
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.cleanup();
        if (durationMs < MIN_RECORDING_MS || blob.size < 512) {
          reject(new Error("A gravação foi demasiado curta. Tente novamente."));
          return;
        }
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        resolve({ bytes, mimeType, durationMs });
      };
      recorder.stop();
    });
  }

  cancel(): void {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}