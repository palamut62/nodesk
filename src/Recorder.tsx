import { useEffect, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { MousePointerSquareDashed, Square, Video, X } from "lucide-react";
import {
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
} from "@tauri-apps/api/window";
import ErrorBubble from "./components/ErrorBubble";
import { recordGif, setWindowBox, stopRecording, VIEW_SIZES } from "./lib/tauri";

interface Props {
  onClose: () => void;
}

export default function Recorder({ onClose }: Props) {
  const [seconds, setSeconds] = useState(15);
  const [fps, setFps] = useState(12);
  const [mode, setMode] = useState<"full" | "region">("full");
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [w, setW] = useState(800);
  const [h, setH] = useState(600);
  const [blur, setBlur] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickStart, setPickStart] = useState<{ x: number; y: number } | null>(null);
  const [pickEnd, setPickEnd] = useState<{ x: number; y: number } | null>(null);
  const savedBoxRef = useRef<{ w: number; h: number; x: number; y: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const startPickRegion = async () => {
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      const scale = await win.scaleFactor();
      savedBoxRef.current = {
        x: pos.x / scale,
        y: pos.y / scale,
        w: size.width / scale,
        h: size.height / scale,
      };
      const mon = await currentMonitor();
      const monW = mon ? mon.size.width / mon.scaleFactor : 1920;
      const monH = mon ? mon.size.height / mon.scaleFactor : 1080;
      await win.setPosition(new LogicalPosition(0, 0));
      await win.setSize(new LogicalSize(Math.round(monW), Math.round(monH)));
      setPickStart(null);
      setPickEnd(null);
      setPicking(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const cancelPick = async () => {
    setPicking(false);
    setPickStart(null);
    setPickEnd(null);
    const box = savedBoxRef.current;
    if (box) {
      try {
        const win = getCurrentWindow();
        await win.setPosition(new LogicalPosition(Math.round(box.x), Math.round(box.y)));
        await setWindowBox(VIEW_SIZES.recorder.w, VIEW_SIZES.recorder.h);
      } catch {}
    }
  };

  const confirmPick = async () => {
    if (!pickStart || !pickEnd) {
      await cancelPick();
      return;
    }
    const sx = Math.min(pickStart.x, pickEnd.x);
    const sy = Math.min(pickStart.y, pickEnd.y);
    const sw = Math.abs(pickEnd.x - pickStart.x);
    const sh = Math.abs(pickEnd.y - pickStart.y);
    let scale = 1;
    try {
      scale = await getCurrentWindow().scaleFactor();
    } catch {}
    setX(Math.round(sx * scale));
    setY(Math.round(sy * scale));
    setW(Math.max(10, Math.round(sw * scale)));
    setH(Math.max(10, Math.round(sh * scale)));
    setMode("region");
    await cancelPick();
  };

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void cancelPick();
      if (e.key === "Enter") void confirmPick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, pickStart, pickEnd]);

  const handleStart = async () => {
    try {
      const path = await saveDialog({
        defaultPath: `nodesk-${Date.now()}.gif`,
        filters: [{ name: "GIF", extensions: ["gif"] }],
      });
      if (!path) return;

      setError("");
      setRecording(true);
      setStatus("Kayıt sürüyor…");
      setElapsed(0);
      const started = Date.now();
      const timer = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - started) / 1000));
      }, 500);

      try {
        await recordGif({
          output_path: path as string,
          fps,
          max_seconds: Math.min(seconds, 300),
          blur_outside: mode === "region" && blur,
          ...(mode === "region" ? { x, y, w, h } : {}),
        });
        setStatus(`Kaydedildi: ${path}`);
      } finally {
        window.clearInterval(timer);
        setRecording(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRecording(false);
    }
  };

  const handleStop = async () => {
    try {
      await stopRecording();
      setStatus("Durduruluyor…");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (picking) {
    const rect = pickStart && pickEnd
      ? {
          left: Math.min(pickStart.x, pickEnd.x),
          top: Math.min(pickStart.y, pickEnd.y),
          width: Math.abs(pickEnd.x - pickStart.x),
          height: Math.abs(pickEnd.y - pickStart.y),
        }
      : null;
    return (
      <div
        className="region-pick-overlay"
        onMouseDown={(e) => {
          setPickStart({ x: e.clientX, y: e.clientY });
          setPickEnd({ x: e.clientX, y: e.clientY });
        }}
        onMouseMove={(e) => {
          if (pickStart) setPickEnd({ x: e.clientX, y: e.clientY });
        }}
        onMouseUp={() => {
          if (rect && rect.width > 5 && rect.height > 5) void confirmPick();
        }}
      >
        <div className="region-pick-hint">
          Alanı çiz · Enter onay · Esc iptal
        </div>
        {rect && (
          <div
            className="region-pick-rect"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="editor-shell">
      <div className="editor-card">
        {error && <ErrorBubble message={error} onClose={() => setError("")} />}

        <div className="editor-titlebar">
          <div className="title">GIF Kaydı</div>
          <button onClick={onClose} title="Kapat" disabled={recording}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Süre (max 300 sn): <b>{seconds}s</b>
            </label>
            <input
              type="range"
              min={3}
              max={300}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              disabled={recording}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ fontSize: 12 }}>FPS:</label>
            <select
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              disabled={recording}
            >
              <option value={8}>8</option>
              <option value={12}>12</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ fontSize: 12 }}>
              <input
                type="radio"
                checked={mode === "full"}
                onChange={() => setMode("full")}
                disabled={recording}
              />{" "}
              Tüm ekran
            </label>
            <label style={{ fontSize: 12 }}>
              <input
                type="radio"
                checked={mode === "region"}
                onChange={() => setMode("region")}
                disabled={recording}
              />{" "}
              Bölge
            </label>
          </div>

          {mode === "region" && (
            <>
              <button
                className="btn ghost"
                onClick={() => void startPickRegion()}
                disabled={recording}
                style={{ alignSelf: "flex-start" }}
              >
                <MousePointerSquareDashed size={14} /> Fare ile seç
              </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ fontSize: 11 }}>
                X
                <input type="number" value={x} onChange={(e) => setX(Number(e.target.value))} disabled={recording} style={{ width: "100%" }} />
              </label>
              <label style={{ fontSize: 11 }}>
                Y
                <input type="number" value={y} onChange={(e) => setY(Number(e.target.value))} disabled={recording} style={{ width: "100%" }} />
              </label>
              <label style={{ fontSize: 11 }}>
                Genişlik
                <input type="number" value={w} onChange={(e) => setW(Number(e.target.value))} disabled={recording} style={{ width: "100%" }} />
              </label>
              <label style={{ fontSize: 11 }}>
                Yükseklik
                <input type="number" value={h} onChange={(e) => setH(Number(e.target.value))} disabled={recording} style={{ width: "100%" }} />
              </label>
              <label style={{ fontSize: 12, gridColumn: "span 2" }}>
                <input type="checkbox" checked={blur} onChange={(e) => setBlur(e.target.checked)} disabled={recording} />{" "}
                Seçim dışını bulanıklaştır
              </label>
            </div>
            </>
          )}

          <div style={{ fontSize: 12, color: "var(--ink-soft)", minHeight: 18 }}>
            {recording ? `${elapsed}s geçti…` : status}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {!recording ? (
              <button className="btn primary" onClick={() => void handleStart()}>
                <Video size={14} /> Kayıt Başlat
              </button>
            ) : (
              <button className="btn danger" onClick={() => void handleStop()}>
                <Square size={14} /> Durdur & Kaydet
              </button>
            )}
          </div>

          <div style={{ fontSize: 11, color: "var(--ink-soft)", opacity: 0.7 }}>
            Not: Maksimum 5 dakika. GIF çıktısı 800 px genişliğe ölçeklenir. Kayıt sırasında uygulama açık kalmalı.
            {recording && <> Durdur'a basınca mevcut kare bitene kadar yazmaya devam eder.</>}
          </div>
        </div>
      </div>
    </div>
  );
}
