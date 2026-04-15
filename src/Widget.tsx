import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  aiFixText,
  hideToTray,
  saveNote,
  startDrag,
  startLiveWhisper,
  type LiveWhisperSession,
} from "./lib/tauri";
import { Pencil, History as HistoryIcon, Mic, X, Settings as SettingsIcon, Square, Camera, Video, AlertCircle } from "lucide-react";
import { useT } from "./lib/i18n";

interface Props {
  onNewNote: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onScreenshot: () => void;
  onRecord: () => void;
}

export default function Widget({ onNewNote, onHistory, onSettings, onScreenshot, onRecord }: Props) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("nodesk");
  const [error, setError] = useState("");
  const liveRef = useRef<LiveWhisperSession | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      try {
        liveRef.current?.cancel();
      } catch {}
      if (timerRef.current != null) clearInterval(timerRef.current);
    };
  }, []);

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
    // AI ile duzelt
    let processed = trimmed;
    try {
      setLabel(t("aiFixing"));
      const fixed = await aiFixText(trimmed, "fix");
      const clean = fixed.trim();
      if (clean && !clean.startsWith("[HATA]")) processed = clean;
    } catch {
      // AI basarisizsa ham metni kaydet
    }
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

  const partialRef = useRef<string>("");

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
        onPartial: (t) => {
          partialRef.current = t;
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
        const t = partialRef.current;
        if (t) {
          const preview = t.length > 16 ? "…" + t.slice(-16) : t;
          setLabel(`🔴 ${meter} ${preview}`);
        } else {
          setLabel(`🔴 ${formatElapsed(s)} ${meter}`);
        }
      }, 150);
    } catch (e: any) {
      console.error("[widget] start err", e);
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
      console.error("[widget] stop err", e);
      flashError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const toggleVoice = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const recordingRef = useRef(false);
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

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

  return (
    <div className="widget">
      <div className={`widget-pill ${recording ? "recording" : ""}`}>
        <div
          className="drag-area"
          onMouseDown={(e) => {
            if (e.button === 0 && !recording && !busy) startDrag();
          }}
        >
          <span className={`dot ${recording ? "dot-rec" : ""}`} />
          <span className="label">{label}</span>
        </div>
        {error && !recording && (
          <button
            className="widget-error-btn"
            title={error}
            onClick={() => setError("")}
            style={{ color: "#e53935", flexShrink: 0 }}
          >
            <AlertCircle size={15} />
          </button>
        )}
        <button
          title={recording ? t("voice.stop") : t("voice.record")}
          onClick={toggleVoice}
          disabled={busy}
          className={recording ? "mic-recording" : ""}
        >
          {recording ? <Square size={14} /> : <Mic size={16} />}
        </button>
        {!recording && (
          <>
            <button
              title={t("history")}
              onClick={onHistory}
              disabled={busy}
            >
              <HistoryIcon size={16} />
            </button>
            <button
              title={t("takeScreenshot")}
              onClick={onScreenshot}
              disabled={busy}
            >
              <Camera size={16} />
            </button>
            <button
              title="GIF kaydı"
              onClick={onRecord}
              disabled={busy}
            >
              <Video size={16} />
            </button>
            <button
              className="primary"
              title={t("newNote")}
              onClick={onNewNote}
              disabled={busy}
            >
              <Pencil size={16} />
            </button>
            <button
              title={t("settings")}
              onClick={onSettings}
              disabled={busy}
            >
              <SettingsIcon size={16} />
            </button>
            <button
              title={t("hideToTray")}
              onClick={() => hideToTray()}
              disabled={busy}
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
