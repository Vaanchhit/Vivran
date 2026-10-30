// Voice in and out with the browser's own speech services: free, no upload,
// works in Chrome and Edge (and Safari for reading aloud). The backend version
// would send audio to POST /api/voice/stt and fetch speech from /api/voice/tts
// (ElevenLabs or Cartesia, already in app/media/), behind the same two hooks.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void;
};

export function useSpeechInput(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText); cb.current = onText;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setError("Voice input needs Chrome or Edge."); return; }
    const r = new Ctor();
    r.lang = "en-IN"; r.interimResults = true; r.continuous = false;
    let text = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) text += res[0].transcript; else interim += res[0].transcript;
      }
      cb.current((text + interim).trim(), false);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone access was blocked." : "Didn't catch that. Try again.");
    r.onend = () => { setListening(false); if (text.trim()) cb.current(text.trim(), true); };
    rec.current = r; setError(null); setListening(true);
    try { r.start(); } catch { setListening(false); }
  }, []);

  const stop = useCallback(() => { rec.current?.stop(); }, []);
  return { listening, supported, error, start, stop };
}

export function useSpeaker() {
  const [speaking, setSpeaking] = useState<string | null>(null);
  const speak = useCallback((id: string, text: string) => {
    const s = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!s) return;
    s.cancel();
    if (speaking === id) { setSpeaking(null); return; }
    const u = new SpeechSynthesisUtterance(text);
    const voice = s.getVoices().find((v) => v.lang === "en-IN") ?? s.getVoices().find((v) => v.lang.startsWith("en"));
    if (voice) u.voice = voice;
    u.rate = 1; u.onend = () => setSpeaking(null); u.onerror = () => setSpeaking(null);
    setSpeaking(id); s.speak(u);
  }, [speaking]);
  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);
  return { speaking, speak };
}
