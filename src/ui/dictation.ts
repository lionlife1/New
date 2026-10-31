// The Web Speech API is not in TypeScript's DOM lib.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const Ctor = (globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
  .SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export const dictationSupported = () => Boolean(Ctor);

/** Start dictation. Calls onText with final chunks; returns a stop function. */
export function startDictation(onText: (t: string) => void, onEnd: (error?: string) => void): () => void {
  const rec = new Ctor!();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = false;
  rec.continuous = true;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
    }
  };
  rec.onerror = (e) => onEnd(e.error === "not-allowed" ? "Microphone permission was denied." : `Dictation stopped (${e.error}).`);
  rec.onend = () => onEnd();
  rec.start();
  return () => rec.stop();
}
