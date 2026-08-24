import { ArrowUp, Mic, Square, VolumeX } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import type { JarvisState } from "../types/jarvis";

interface Props {
  disabled: boolean;
  state: JarvisState;
  voiceAvailable: boolean;
  onSubmit: (value: string) => void;
  onVoiceAction: () => void;
}

export function CommandInput({ disabled, state, voiceAvailable, onSubmit, onVoiceAction }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const voiceDisabled = !voiceAvailable || (disabled && !isListening && !isSpeaking);

  const submit = () => {
    const clean = value.trim();
    if (!clean || disabled) return;
    onSubmit(clean);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
  };

  const voiceLabel = !voiceAvailable ? "Reconhecimento de voz indisponível; o chat por texto continua ativo." : isListening ? "Terminar gravação" : isSpeaking ? "Interromper voz" : "Iniciar gravação";

  return (
    <div className={`command-area ${isListening ? "is-listening" : ""}`}>
      <button className={`mic-button ${isListening ? "active" : ""} ${isSpeaking ? "speaking" : ""}`} disabled={voiceDisabled} onClick={onVoiceAction} title={voiceLabel} aria-label={voiceLabel}>
        {isListening ? <Square size={14} /> : isSpeaking ? <VolumeX size={17} /> : <Mic size={17} />}
      </button>
      <span className="prompt-mark">›</span>
      <textarea ref={textareaRef} rows={1} value={value} disabled={disabled} onChange={(event) => {
        setValue(event.target.value);
        event.target.style.height = "auto";
        event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
      }} onKeyDown={handleKeyDown} placeholder={isListening ? "Listening — click again to send..." : disabled ? "Processing request..." : "Ask JARVIS anything..."} aria-label="Message JARVIS" />
      {isListening && <span className="recording-label"><i /> LIVE</span>}
      <button className="send-button" onClick={submit} disabled={disabled || !value.trim()}><span>SEND</span><ArrowUp size={16}/></button>
    </div>
  );
}