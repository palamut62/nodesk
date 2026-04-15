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
import {
  checkFfmpeg,
  deleteFile,
  exportGif,
  setWindowBox,
  startRecording,
  stopRecording,
  VIEW_SIZES,
} from "./lib/tauri";

interface Props {
  onClose: () => void;
}

type OutputFormat = "mp4" | "gif";

interface ActiveJob {
  format: OutputFormat;
  targetPath: string;
  capturePath: string;
  speed: number;
  gifFps: number;
  gifWidth: number;
  region?: { x: number; y: number; w: number; h: number };
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export default function Recorder({ onClose }: Props) {
  const [seconds, setSeconds] = useState(30);
  const [fps, setFps] = useState(24);
  const [mode, setMode] = useState<"full" | "region">("full");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp4");
  const [speed, setSpeed] = useState(1);
  const [gifFps, setGifFps] = useState(12);
  const [gifWidth, setGifWidth] = useState(0);

  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [w, setW] = useState(800);
  const [h, setH] = useState(600);

  const [picking, setPicking] = useState(false);
  const [pickStart, setPickStart] = useState<{ x: number; y: number } | null>(null);
  const [pickEnd, setPickEnd] = useState<{ x: number; y: number } | null>(null);
  const savedBoxRef = useRef<{ w: number; h: number; x: number; y: number } | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null);

  const activeJobRef = useRef<ActiveJob | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const stopLockRef = useRef(false);
  const recordingRef = useRef(false);
  const finishRef = useRef<(reason: "manual" | "auto") => Promise<void>>(async () => {});

  const clearTimers = () => {
    if (tickTimerRef.current != null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (autoStopRef.current != null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  const cleanupTmpCapture = async (job: ActiveJob | null) => {
    if (!job) return;
    if (job.format !== "gif") return;
    if (job.capturePath === job.targetPath) return;
    try {
      await deleteFile(job.capturePath);
    } catch {
      // no-op
    }
  };

  const finishRecording = async (reason: "manual" | "auto") => {
    if (stopLockRef.current) return;
    stopLockRef.current = true;
    clearTimers();

    const job = activeJobRef.current;
    try {
      setStatus(
        reason === "auto"
          ? "Sure doldu, kayit sonlandiriliyor..."
          : "Kayit sonlandiriliyor...",
      );
      await stopRecording();

      if (job?.format === "gif") {
        setConverting(true);
        setStatus("GIF hazirlaniyor...");
        await exportGif({
          input_path: job.capturePath,
          output_path: job.targetPath,
          fps: job.gifFps,
          width: job.gifWidth > 0 ? job.gifWidth : undefined,
          speed: job.speed,
          ...(job.region ?? {}),
        });
        setStatus(`GIF kaydedildi: ${job.targetPath}`);
      } else if (job) {
        setStatus(`MP4 kaydedildi: ${job.targetPath}`);
      } else {
        setStatus("Kayit durduruldu.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      await cleanupTmpCapture(job);
      activeJobRef.current = null;
      setConverting(false);
      setRecording(false);
      stopLockRef.current = false;
    }
  };

  useEffect(() => {
    void checkFfmpeg().then(setFfmpegOk).catch(() => setFfmpegOk(false));
    return () => {
      clearTimers();
    };
  }, []);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    finishRef.current = finishRecording;
  }, [finishRecording]);

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
    if (!box) return;
    try {
      const win = getCurrentWindow();
      await win.setPosition(new LogicalPosition(Math.round(box.x), Math.round(box.y)));
      await setWindowBox(VIEW_SIZES.recorder.w, VIEW_SIZES.recorder.h);
    } catch {
      // no-op
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
    } catch {
      // no-op
    }
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
      const ext = outputFormat === "gif" ? "gif" : "mp4";
      const path = await saveDialog({
        defaultPath: `nodesk-${Date.now()}.${ext}`,
        filters: [
          {
            name: outputFormat === "gif" ? "GIF Animation" : "MP4 Video",
            extensions: [ext],
          },
        ],
      });
      if (!path) return;

      const targetPath = String(path);
      const capturePath =
        outputFormat === "mp4"
          ? targetPath
          : targetPath.replace(/\.gif$/i, "") + `.nodesk-tmp-${Date.now()}.mkv`;

      activeJobRef.current = {
        format: outputFormat,
        targetPath,
        capturePath,
        speed,
        gifFps,
        gifWidth,
        region: mode === "region" ? { x, y, w, h } : undefined,
      };

      setError("");
      setStatus("Kayit baslatiliyor...");
      setRecording(true);
      setElapsed(0);

      const startedAt = Date.now();
      tickTimerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 200);

      autoStopRef.current = window.setTimeout(() => {
        void finishRecording("auto");
      }, Math.min(seconds, 300) * 1000);

      await startRecording({
        output_path: capturePath,
        fps,
        max_seconds: Math.min(seconds, 300),
        speed: outputFormat === "mp4" ? speed : 1,
        lossless: outputFormat === "gif",
        ...(mode === "region" ? { x, y, w, h } : {}),
      });
      setStatus("Kayit devam ediyor...");
    } catch (e) {
      clearTimers();
      const job = activeJobRef.current;
      activeJobRef.current = null;
      setRecording(false);
      setError(e instanceof Error ? e.message : String(e));
      await cleanupTmpCapture(job);
    }
  };

  const handleStop = async () => {
    await finishRecording("manual");
  };

  if (picking) {
    const rect =
      pickStart && pickEnd
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
          if (e.button !== 0) return;
          setPickStart({ x: e.clientX, y: e.clientY });
          setPickEnd({ x: e.clientX, y: e.clientY });
        }}
        onMouseMove={(e) => {
          if (pickStart) setPickEnd({ x: e.clientX, y: e.clientY });
        }}
        onMouseUp={() => {
          if (rect && rect.width > 5 && rect.height > 5) {
            void confirmPick();
          }
        }}
      >
        {!rect && <div className="region-pick-mask full" />}
        {rect && (
          <>
            <div className="region-pick-mask" style={{ left: 0, top: 0, width: "100%", height: rect.top }} />
            <div className="region-pick-mask" style={{ left: 0, top: rect.top, width: rect.left, height: rect.height }} />
            <div className="region-pick-mask" style={{ left: rect.left + rect.width, top: rect.top, width: `calc(100% - ${rect.left + rect.width}px)`, height: rect.height }} />
            <div className="region-pick-mask" style={{ left: 0, top: rect.top + rect.height, width: "100%", height: `calc(100% - ${rect.top + rect.height}px)` }} />
          </>
        )}
        <div className="region-pick-hint">Alani ciz · Enter onay · Esc iptal</div>
        {rect && (
          <div
            className="region-pick-rect"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
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
          <div className="title">Ekran Kaydi (MP4 / GIF)</div>
          <button onClick={onClose} title="Kapat" disabled={recording || converting}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {ffmpegOk === false && (
            <div style={{ fontSize: 12, color: "#b0271c" }}>
              FFmpeg bulunamadi. Kayit icin FFmpeg PATH icinde olmali.
            </div>
          )}

          <div style={{ display: "flex", gap: 14 }}>
            <label style={{ fontSize: 12 }}>
              <input
                type="radio"
                checked={outputFormat === "mp4"}
                onChange={() => setOutputFormat("mp4")}
                disabled={recording || converting}
              />{" "}
              MP4
            </label>
            <label style={{ fontSize: 12 }}>
              <input
                type="radio"
                checked={outputFormat === "gif"}
                onChange={() => setOutputFormat("gif")}
                disabled={recording || converting}
              />{" "}
              GIF
            </label>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Sure (max 300 sn): <b>{seconds}s</b>
            </label>
            <input
              type="range"
              min={3}
              max={300}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              disabled={recording || converting}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12 }}>FPS:</label>
            <select
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              disabled={recording || converting}
            >
              <option value={15}>15</option>
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>

            <label style={{ fontSize: 12, marginLeft: 6 }}>Hiz:</label>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              disabled={recording || converting}
            >
              {SPEED_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}x
                </option>
              ))}
            </select>
          </div>

          {outputFormat === "gif" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  GIF FPS
                  <input
                    type="number"
                    min={5}
                    max={24}
                    value={gifFps}
                    onChange={(e) => setGifFps(Number(e.target.value))}
                    disabled={recording || converting}
                    style={{ width: "100%" }}
                  />
                </label>
                <label style={{ fontSize: 11 }}>
                  GIF genislik
                  <input
                    type="number"
                    min={0}
                    max={1920}
                    step={2}
                    value={gifWidth}
                    onChange={(e) => setGifWidth(Number(e.target.value))}
                    disabled={recording || converting}
                    style={{ width: "100%" }}
                  />
                </label>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", opacity: 0.75 }}>
                GIF genislik: 0 = orijinal boyut
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ fontSize: 12 }}>
              <input
                type="radio"
                checked={mode === "full"}
                onChange={() => setMode("full")}
                disabled={recording || converting}
              />{" "}
              Tum ekran
            </label>
            <label style={{ fontSize: 12 }}>
              <input
                type="radio"
                checked={mode === "region"}
                onChange={() => setMode("region")}
                disabled={recording || converting}
              />{" "}
              Bolge
            </label>
          </div>

          {mode === "region" && (
            <>
              <button
                className="btn ghost"
                onClick={() => void startPickRegion()}
                disabled={recording || converting}
                style={{ alignSelf: "flex-start" }}
              >
                <MousePointerSquareDashed size={14} /> Fare ile sec
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11 }}>
                  X<input type="number" value={x} onChange={(e) => setX(Number(e.target.value))} disabled={recording || converting} style={{ width: "100%" }} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Y<input type="number" value={y} onChange={(e) => setY(Number(e.target.value))} disabled={recording || converting} style={{ width: "100%" }} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Genislik<input type="number" value={w} onChange={(e) => setW(Number(e.target.value))} disabled={recording || converting} style={{ width: "100%" }} />
                </label>
                <label style={{ fontSize: 11 }}>
                  Yukseklik<input type="number" value={h} onChange={(e) => setH(Number(e.target.value))} disabled={recording || converting} style={{ width: "100%" }} />
                </label>
              </div>
            </>
          )}

          <div style={{ fontSize: 12, color: "var(--ink-soft)", minHeight: 18 }}>
            {recording
              ? `${elapsed}s / ${seconds}s${status ? ` · ${status}` : ""}`
              : status}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {!recording ? (
              <button
                className="btn primary"
                onClick={() => void handleStart()}
                disabled={converting}
              >
                <Video size={14} /> Kayit Baslat
              </button>
            ) : (
              <button
                className="btn danger"
                onClick={() => void handleStop()}
                disabled={converting}
              >
                <Square size={14} /> Durdur ve Kaydet
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
