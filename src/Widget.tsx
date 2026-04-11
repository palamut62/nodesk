import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  hideToTray,
  saveNote,
  startDrag,
  startLiveWhisper,
  type LiveWhisperSession,
} from "./lib/tauri";
import { Pencil, History as HistoryIcon, Mic, X, Settings as SettingsIcon } from "lucide-react";

interface Props {
  onNewNote: () => void;
  onHistory: () => void;
  onSettings: () => void;
}

export default function Widget({ onNewNote, onHistory, onSettings }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("nodesk");
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

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const saveTranscript = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      const dbg = liveRef.current?.getDebug?.() ?? "";
      flashLabel(`boş · ${dbg}`, 6000);
      return;
    }
    if (trimmed.startsWith("[HATA]")) {
      flashLabel(trimmed.slice(0, 60), 6000);
      return;
    }
    const now = new Date();
    const title = `Sesli not · ${now.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const html = trimmed
      .split(/\n+/)
      .map((l) => `<p>${l.trim()}</p>`)
      .join("");
    await saveNote(null, title, html);
    flashLabel("✓ kaydedildi");
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
      flashLabel(`hata: ${String(e).slice(0, 30)}`);
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
    setLabel("🔄 işleniyor…");
    try {
      const text = await session.stop();
      await saveTranscript(text);
    } catch (e: any) {
      console.error("[widget] stop err", e);
      flashLabel(`hata: ${String(e).slice(0, 30)}`);
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
        <button
          title={recording ? "Kaydı bitir ve çevir" : "Sesli not kaydet"}
          onClick={toggleVoice}
          disabled={busy}
          className={recording ? "mic-recording" : ""}
        >
          <Mic size={16} />
        </button>
        <button
          title="Geçmiş notlar"
          onClick={onHistory}
          disabled={recording || busy}
        >
          <HistoryIcon size={16} />
        </button>
        <button
          className="primary"
          title="Yeni not"
          onClick={onNewNote}
          disabled={recording || busy}
        >
          <Pencil size={16} />
        </button>
        <button
          title="Ayarlar"
          onClick={onSettings}
          disabled={recording || busy}
        >
          <SettingsIcon size={16} />
        </button>
        <button
          title="Tray'e gizle"
          onClick={() => hideToTray()}
          disabled={recording || busy}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
