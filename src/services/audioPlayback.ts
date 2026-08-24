export class AudioPlaybackService {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private resolvePlayback: (() => void) | null = null;

  get isPlaying(): boolean { return Boolean(this.audio && !this.audio.paused); }

  async play(bytes: number[], mimeType = "audio/mpeg"): Promise<void> {
    this.stop();
    const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
    this.objectUrl = URL.createObjectURL(blob);
    this.audio = new Audio(this.objectUrl);
    await new Promise<void>((resolve, reject) => {
      this.resolvePlayback = resolve;
      if (!this.audio) { this.resolvePlayback = null; reject(new Error("Não foi possível preparar o áudio.")); return; }
      this.audio.onended = () => { this.release(); resolve(); };
      this.audio.onerror = () => { this.release(); reject(new Error("Não foi possível reproduzir a resposta em voz.")); };
      this.audio.play().catch(() => { this.release(); reject(new Error("A reprodução de áudio foi bloqueada.")); });
    });
  }

  stop(): void {
    const resolve = this.resolvePlayback;
    if (this.audio) { this.audio.onended = null; this.audio.onerror = null; this.audio.pause(); this.audio.currentTime = 0; }
    this.release();
    resolve?.();
  }

  private release(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.audio = null;
    this.resolvePlayback = null;
  }
}