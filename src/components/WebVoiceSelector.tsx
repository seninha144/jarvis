import { useEffect, useState } from "react";
import {
  BrowserSpeechSynthesisService,
  getSavedWebVoiceId,
  loadWebVoices,
  saveWebVoiceId,
  selectBestWebVoice,
  voiceStorageId,
} from "../services/browserSpeechSynthesis";

export function WebVoiceSelector() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selection, setSelection] = useState(getSavedWebVoiceId);

  useEffect(() => {
    if (!BrowserSpeechSynthesisService.isSupported()) return;
    const refresh = () => {
      void loadWebVoices().then((available) => setVoices(available));
    };
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, []);

  if (!voices.length) return null;
  const automatic = selectBestWebVoice(voices);
  return (
    <label className="web-voice-setting" title="Voz usada pelo navegador">
      <span>WEB VOICE</span>
      <select value={selection} onChange={(event) => {
        const next = event.target.value;
        saveWebVoiceId(next);
        setSelection(next);
      }} aria-label="Selecionar voz Web">
        <option value="">AUTO — {automatic?.name ?? "DEFAULT"}</option>
        {voices.map((voice) => (
          <option key={voiceStorageId(voice)} value={voiceStorageId(voice)}>
            {voice.name} — {voice.lang}
          </option>
        ))}
      </select>
    </label>
  );
}
