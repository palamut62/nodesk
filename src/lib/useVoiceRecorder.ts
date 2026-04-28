import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  aiFixText,
  saveNote,
  startLiveWhisper,
  type LiveWhisperSession,
} from "./tauri";
import { useT } from "./i18n";

export function useVoiceRecorder() {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("nodesk");
  const [error, setError] = useState("");
  const liveRef = useRef<LiveWhisperSession | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const partialRef = useRef<string>("");
  const recordingRef = useRef(false);

  useEffect(() => {
    return () => {
      try {
        liveRef.current?.cancel();
      } catch {}
      if (timerRef.current != null) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  const flashLabel = (text: string, ms = 2200) => {
    setLabel(text);
    setTimeout(() => setLabel("nodesk"), ms);
  };

  const flashError = (text: string) => {
    setError(text);
    setLabel("hata!");
    setTimeout(() => setLabel("nodesk"), 3000);
  };

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const saveTranscript = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      const dbg = liveRef.current?.getDebug?.() ?? "";
      flashLabel(`${t("empty")} · ${dbg}`, 6000);
      return;
    }
    if (trimmed.startsWith("[HATA]")) {
      flashError(trimmed.slice("[HATA]".length).trim());
      return;
    }
    let processed = trimmed;
    try {
      setLabel(t("aiFixing"));
      const fixed = await aiFixText(trimmed, "fix");
      const clean = fixed.trim();
      if (clean && !clean.startsWith("[HATA]")) processed = clean;
    } catch {}
    const now = new Date();
    const title = `Sesli not · ${now.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const html = processed
      .split(/\n+/)
      .map((l) => `<p>${l.trim()}</p>`)
      .join("");
    await saveNote(null, title, html);
    flashLabel(t("saved"));
  };

  const startRecording = async () => {
    if (busy || recording) return;
    try {
      partialRef.current = "";
      let currentLevel = 0;
      const session = await startLiveWhisper({
        intervalMs: 3500,
        onLevel: (l) => {
          currentLevel = l;
        },
        onPartial: (txt) => {
          partialRef.current = txt;
        },
      });
      liveRef.current = session;
      setRecording(true);
      startTimeRef.current = Date.now();
      setLabel("🔴 00:00");
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const bars = Math.max(0, Math.min(8, Math.round(currentLevel * 20)));
        const meter = "█".repeat(bars) + "░".repeat(8 - bars);
        const txt = partialRef.current;
        if (txt) {
          const preview = txt.length > 16 ? "…" + txt.slice(-16) : txt;
          setLabel(`🔴 ${meter} ${preview}`);
        } else {
          setLabel(`🔴 ${formatElapsed(s)} ${meter}`);
        }
      }, 150);
    } catch (e: any) {
      console.error("[voice] start err", e);
      flashError(String(e?.message || e));
    }
  };

  const stopRecording = async () => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const session = liveRef.current;
    if (!session) return;
    liveRef.current = null;
    setRecording(false);
    setBusy(true);
    setLabel(t("processing"));
    try {
      const text = await session.stop();
      await saveTranscript(text);
    } catch (e: any) {
      console.error("[voice] stop err", e);
      flashError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const toggleVoice = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  useEffect(() => {
    const unDown = listen("voice-ptt-down", () => {
      if (recordingRef.current) return;
      startRecording();
    });
    const unUp = listen("voice-ptt-up", () => {
      if (!recordingRef.current) return;
      stopRecording();
    });
    const unToggle = listen("voice-note-toggle", () => {
      toggleVoice();
    });
    return () => {
      unDown.then((f) => f());
      unUp.then((f) => f());
      unToggle.then((f) => f());
    };
  }, []);

  return {
    recording,
    busy,
    label,
    error,
    setError,
    toggleVoice,
  };
}
