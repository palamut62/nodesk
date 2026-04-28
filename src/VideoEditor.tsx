import { useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  checkFfmpeg,
  prepareVideoPreview,
  probeVideo,
  processVideo,
  type BlurMode,
  type BlurRegionPayload,
  type VideoOutputFormat,
} from "./lib/tauri";
import { Play, Pause, Plus, Trash2, X, Music, Scissors } from "lucide-react";

interface Props {
  initialPath?: string | null;
  onClose: () => void;
}

interface BlurRegion {
  id: number;
  // Video-coordinate (gercek piksel) bolge
  x: number;
  y: number;
  w: number;
  h: number;
  mode: BlurMode;
  // Tum video icin null/null, aralik icin saniye
  tStart: number | null;
  tEnd: number | null;
  strength: number;
}

const FORMATS: { value: VideoOutputFormat; label: string; ext: string }[] = [
  { value: "mp4", label: "MP4 (H.264)", ext: "mp4" },
  { value: "webm", label: "WebM (VP9)", ext: "webm" },
  { value: "mov", label: "MOV (H.264)", ext: "mov" },
  { value: "gif", label: "GIF", ext: "gif" },
];

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 100);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

const BROWSER_NATIVE_EXT = new Set(["mp4", "webm", "mov", "m4v", "ogg", "ogv"]);

export default function VideoEditor({ initialPath, onClose }: Props) {
  const [filePath, setFilePath] = useState<string | null>(initialPath ?? null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [transcoding, setTranscoding] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // videoSize: ORIJINAL kaynak video boyutu — blur koordinatlari ve export bunu kullanir.
  const [videoSize, setVideoSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [probedSize, setProbedSize] = useState(false);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  const [blurs, setBlurs] = useState<BlurRegion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [audioVolume, setAudioVolume] = useState(1.0);
  const [audioReplace, setAudioReplace] = useState(false);

  const [format, setFormat] = useState<VideoOutputFormat>("mp4");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [ffmpegOk, setFfmpegOk] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const idCounter = useRef(1);

  useEffect(() => {
    checkFfmpeg().then(setFfmpegOk).catch(() => setFfmpegOk(false));
  }, []);

  const videoSrc = useMemo(
    () => (previewPath ? convertFileSrc(previewPath) : null),
    [previewPath],
  );

  // Dosya secildiginde: tarayici dogal cozemiyorsa hemen mp4 onizleme uret.
  // Cozebilse bile onError ile fallback'e dusuyor.
  useEffect(() => {
    if (!filePath) {
      setPreviewPath(null);
      return;
    }
    const ext = (filePath.split(".").pop() || "").toLowerCase();
    if (BROWSER_NATIVE_EXT.has(ext)) {
      setPreviewPath(filePath);
    } else {
      setPreviewPath(null);
      void runTranscodePreview(filePath);
    }
  }, [filePath]);

  const runTranscodePreview = async (src: string) => {
    setTranscoding(true);
    setError("");
    setStatus("Önizleme hazırlanıyor...");
    try {
      const out = await prepareVideoPreview(src);
      // Probe dimensions/duration in case <video> can't read them later
      try {
        const info = await probeVideo(src);
        if (info.width && info.height) {
          setVideoSize({ w: info.width, h: info.height });
          setProbedSize(true);
        }
        if (info.duration) {
          setDuration(info.duration);
          setTrimEnd(info.duration);
        }
      } catch {}
      setPreviewPath(out);
      setStatus("");
    } catch (e) {
      setError(`Önizleme oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`);
      setStatus("");
    } finally {
      setTranscoding(false);
    }
  };

  const pickFile = async () => {
    setError("");
    const path = await openDialog({
      multiple: false,
      filters: [
        { name: "Video", extensions: ["mp4", "mov", "webm", "mkv", "avi", "wmv", "flv", "m4v", "mpg", "mpeg", "ts", "gif"] },
      ],
    });
    if (path && typeof path === "string") {
      setFilePath(path);
      setBlurs([]);
      setSelectedId(null);
      setTrimStart(0);
      setTrimEnd(0);
      setDuration(0);
      setCurrentTime(0);
      setProbedSize(false);
      setVideoSize({ w: 0, h: 0 });
      // Native uzantilarda da probe et — orijinal boyutu kesin bilelim.
      void probeVideo(path)
        .then((info) => {
          if (info.width && info.height) {
            setVideoSize({ w: info.width, h: info.height });
            setProbedSize(true);
          }
          if (info.duration) {
            setDuration(info.duration);
            setTrimEnd(info.duration);
          }
        })
        .catch(() => {});
    }
  };

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration((d) => d || v.duration || 0);
    setTrimEnd((te) => (te > 0 ? te : v.duration || 0));
    // Probe yapilmadiysa video elementinin boyutlarini orijinal say.
    if (!probedSize) {
      setVideoSize({ w: v.videoWidth, h: v.videoHeight });
    }
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  // Blur bolgesi tasima/yeniden boyutlandirma
  type BlurDrag =
    | { kind: "move"; id: number; startMx: number; startMy: number; orig: { x: number; y: number; w: number; h: number } }
    | { kind: "resize"; id: number; corner: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w"; startMx: number; startMy: number; orig: { x: number; y: number; w: number; h: number } };
  const blurDragRef = useRef<BlurDrag | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = blurDragRef.current;
      if (!drag) return;
      const box = previewBoxRef.current?.getBoundingClientRect();
      if (!box || !videoSize.w) return;
      const scale = Math.min(box.width / videoSize.w, box.height / videoSize.h);
      const dx = (e.clientX - drag.startMx) / scale;
      const dy = (e.clientY - drag.startMy) / scale;

      setBlurs((prev) =>
        prev.map((b) => {
          if (b.id !== drag.id) return b;
          if (drag.kind === "move") {
            const nx = Math.max(0, Math.min(videoSize.w - drag.orig.w, drag.orig.x + dx));
            const ny = Math.max(0, Math.min(videoSize.h - drag.orig.h, drag.orig.y + dy));
            return { ...b, x: Math.round(nx), y: Math.round(ny) };
          }
          // resize
          let { x, y, w, h } = drag.orig;
          const c = drag.corner;
          if (c.includes("w")) {
            const nx = Math.max(0, Math.min(x + w - 4, x + dx));
            w = w + (x - nx);
            x = nx;
          }
          if (c.includes("e")) {
            w = Math.max(4, Math.min(videoSize.w - x, w + dx));
          }
          if (c.includes("n")) {
            const ny = Math.max(0, Math.min(y + h - 4, y + dy));
            h = h + (y - ny);
            y = ny;
          }
          if (c.includes("s")) {
            h = Math.max(4, Math.min(videoSize.h - y, h + dy));
          }
          return {
            ...b,
            x: Math.round(x),
            y: Math.round(y),
            w: Math.round(w),
            h: Math.round(h),
          };
        }),
      );
    };
    const onUp = () => {
      blurDragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [videoSize.w, videoSize.h]);

  const startBlurMove = (e: React.MouseEvent, b: BlurRegion) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(b.id);
    blurDragRef.current = {
      kind: "move",
      id: b.id,
      startMx: e.clientX,
      startMy: e.clientY,
      orig: { x: b.x, y: b.y, w: b.w, h: b.h },
    };
  };
  const startBlurResize = (
    e: React.MouseEvent,
    b: BlurRegion,
    corner: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(b.id);
    blurDragRef.current = {
      kind: "resize",
      id: b.id,
      corner,
      startMx: e.clientX,
      startMy: e.clientY,
      orig: { x: b.x, y: b.y, w: b.w, h: b.h },
    };
  };

  const seek = (t: number) => {
    const clamped = Math.max(0, Math.min(duration || t, t));
    setCurrentTime(clamped);
    const v = videoRef.current;
    if (v) {
      try {
        v.currentTime = clamped;
      } catch {}
    }
  };

  // Canvas'tan video koordinatlarina cevir
  const previewToVideo = (px: number, py: number, pw: number, ph: number) => {
    const box = previewBoxRef.current?.getBoundingClientRect();
    if (!box || !videoSize.w || !videoSize.h) return null;
    // Video object-fit: contain, so calc actual rendered rect
    const scale = Math.min(box.width / videoSize.w, box.height / videoSize.h);
    const renderW = videoSize.w * scale;
    const renderH = videoSize.h * scale;
    const offX = (box.width - renderW) / 2;
    const offY = (box.height - renderH) / 2;
    const vx = (px - offX) / scale;
    const vy = (py - offY) / scale;
    const vw = pw / scale;
    const vh = ph / scale;
    return {
      x: Math.max(0, Math.round(vx)),
      y: Math.max(0, Math.round(vy)),
      w: Math.max(2, Math.round(vw)),
      h: Math.max(2, Math.round(vh)),
    };
  };

  const videoToPreview = (vx: number, vy: number, vw: number, vh: number) => {
    const box = previewBoxRef.current?.getBoundingClientRect();
    if (!box || !videoSize.w || !videoSize.h) return null;
    const scale = Math.min(box.width / videoSize.w, box.height / videoSize.h);
    const renderW = videoSize.w * scale;
    const renderH = videoSize.h * scale;
    const offX = (box.width - renderW) / 2;
    const offY = (box.height - renderH) / 2;
    return {
      left: offX + vx * scale,
      top: offY + vy * scale,
      width: vw * scale,
      height: vh * scale,
    };
  };

  const onPreviewMouseDown = (e: React.MouseEvent) => {
    if (!videoSize.w) return;
    const box = previewBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    drawStartRef.current = { x: e.clientX - box.left, y: e.clientY - box.top };
    setDrawing({ x: drawStartRef.current.x, y: drawStartRef.current.y, w: 0, h: 0 });
  };
  const onPreviewMouseMove = (e: React.MouseEvent) => {
    if (!drawStartRef.current) return;
    const box = previewBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    const cx = e.clientX - box.left;
    const cy = e.clientY - box.top;
    const x = Math.min(drawStartRef.current.x, cx);
    const y = Math.min(drawStartRef.current.y, cy);
    setDrawing({
      x,
      y,
      w: Math.abs(cx - drawStartRef.current.x),
      h: Math.abs(cy - drawStartRef.current.y),
    });
  };
  const onPreviewMouseUp = () => {
    if (!drawing || !drawStartRef.current) {
      drawStartRef.current = null;
      setDrawing(null);
      return;
    }
    if (drawing.w > 8 && drawing.h > 8) {
      const v = previewToVideo(drawing.x, drawing.y, drawing.w, drawing.h);
      if (v) {
        const id = idCounter.current++;
        setBlurs((prev) => [
          ...prev,
          {
            id,
            x: v.x,
            y: v.y,
            w: v.w,
            h: v.h,
            mode: "inside",
            tStart: null,
            tEnd: null,
            strength: 18,
          },
        ]);
        setSelectedId(id);
      }
    }
    drawStartRef.current = null;
    setDrawing(null);
  };

  const updateBlur = (id: number, patch: Partial<BlurRegion>) => {
    setBlurs((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const removeBlur = (id: number) => {
    setBlurs((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const pickAudio = async () => {
    const p = await openDialog({
      multiple: false,
      filters: [{ name: "Audio", extensions: ["mp3", "wav", "m4a", "aac", "ogg", "flac"] }],
    });
    if (p && typeof p === "string") setAudioPath(p);
  };

  const handleExport = async () => {
    if (!filePath || busy) return;
    setError("");
    setStatus("");
    const fmt = FORMATS.find((f) => f.value === format)!;
    const out = await saveDialog({
      defaultPath: `nodesk-edit-${Date.now()}.${fmt.ext}`,
      filters: [{ name: fmt.label, extensions: [fmt.ext] }],
    });
    if (!out) return;

    const blursPayload: BlurRegionPayload[] = blurs.map((b) => ({
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      mode: b.mode,
      strength: b.strength,
      ...(b.tStart != null ? { t_start: b.tStart } : {}),
      ...(b.tEnd != null ? { t_end: b.tEnd } : {}),
    }));

    const trimChanged = trimStart > 0.01 || trimEnd < duration - 0.01;
    setBusy(true);
    setStatus("Isleniyor...");
    try {
      await processVideo({
        input: filePath,
        output: String(out),
        ...(trimChanged ? { trim_start: trimStart, trim_end: trimEnd } : {}),
        blurs: blursPayload,
        ...(audioPath
          ? {
              audio: {
                path: audioPath,
                volume: audioVolume,
                replace_original: audioReplace,
              },
            }
          : {}),
        format,
      });
      setStatus(`Kaydedildi: ${out}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const selected = blurs.find((b) => b.id === selectedId) || null;
  const isActive = (b: BlurRegion) =>
    b.tStart == null || b.tEnd == null || (currentTime >= b.tStart && currentTime <= b.tEnd);

  // Canvas RAF dongusu: aktif blur bolgelerini gercek bulanik video olarak ciz.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    let raf = 0;
    const draw = () => {
      const box = previewBoxRef.current?.getBoundingClientRect();
      const ow = videoSize.w; // orijinal video boyutu (blur coord referansi)
      const oh = videoSize.h;
      const pw = video.videoWidth || ow;
      const ph = video.videoHeight || oh;
      if (!box || !ow || !oh || !pw || !ph) {
        raf = requestAnimationFrame(draw);
        return;
      }
      // Onizleme render rect: object-fit contain (orijinal en-boy oraninda)
      const scale = Math.min(box.width / ow, box.height / oh);
      const renderW = ow * scale;
      const renderH = oh * scale;
      const offX = (box.width - renderW) / 2;
      const offY = (box.height - renderH) / 2;
      // Source rect olceklemesi: orijinal coord -> preview video coord
      const sxScale = pw / ow;
      const syScale = ph / oh;

      if (canvas.width !== Math.round(box.width)) canvas.width = Math.round(box.width);
      if (canvas.height !== Math.round(box.height)) canvas.height = Math.round(box.height);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const activeNow = blurs.filter(
        (b) => b.tStart == null || b.tEnd == null || (currentTime >= b.tStart && currentTime <= b.tEnd),
      );

      for (const b of activeNow) {
        const blurPx = Math.max(2, b.strength) * 0.7;
        // ox/oy/ow/oh: orijinal koordinatlar
        const drawBand = (ox: number, oy: number, owr: number, ohr: number) => {
          if (owr <= 0 || ohr <= 0) return;
          const dx = offX + ox * scale;
          const dy = offY + oy * scale;
          const dw = owr * scale;
          const dh = ohr * scale;
          // Source coordinates olcekle: video element boyutuna goher
          const sx = ox * sxScale;
          const sy = oy * syScale;
          const sw = owr * sxScale;
          const sh = ohr * syScale;
          ctx.save();
          ctx.beginPath();
          ctx.rect(dx, dy, dw, dh);
          ctx.clip();
          ctx.filter = `blur(${blurPx}px)`;
          try {
            ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
          } catch {}
          ctx.restore();
        };

        if (b.mode === "inside") {
          drawBand(b.x, b.y, b.w, b.h);
        } else {
          // 4 bant: ust, alt, sol, sag
          drawBand(0, 0, ow, b.y);
          drawBand(0, b.y + b.h, ow, Math.max(0, oh - (b.y + b.h)));
          drawBand(0, b.y, b.x, b.h);
          drawBand(b.x + b.w, b.y, Math.max(0, ow - (b.x + b.w)), b.h);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [blurs, currentTime, filePath, previewPath]);

  return (
    <div className="video-editor">
      <div className="ve-header">
        <div className="ve-title">
          <Scissors size={14} /> Video Düzenle
        </div>
        <div className="ve-actions">
          {!filePath && (
            <button className="ve-btn primary" onClick={pickFile}>
              Video seç
            </button>
          )}
          {filePath && (
            <button className="ve-btn" onClick={pickFile} disabled={busy}>
              Başka video
            </button>
          )}
          <button className="ve-btn" onClick={onClose} disabled={busy} title="Kapat">
            <X size={14} />
          </button>
        </div>
      </div>

      {!ffmpegOk && (
        <div className="ve-warn">FFmpeg PATH'de bulunamadı. Düzenleme için FFmpeg kurulu olmalı.</div>
      )}

      {!filePath && (
        <div className="ve-empty">
          <p>Düzenlemek için bir video dosyası seç.</p>
          <p style={{ opacity: 0.7, fontSize: 12 }}>Desteklenen: mp4, mov, webm, mkv, avi, gif</p>
        </div>
      )}

      {filePath && (
        <>
          <div
            className="ve-preview"
            ref={previewBoxRef}
            onMouseDown={onPreviewMouseDown}
            onMouseMove={onPreviewMouseMove}
            onMouseUp={onPreviewMouseUp}
            onMouseLeave={onPreviewMouseUp}
          >
            {videoSrc && (
              <video
                ref={videoRef}
                src={videoSrc}
                onLoadedMetadata={onLoadedMetadata}
                onTimeUpdate={onTimeUpdate}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() => {
                  if (filePath && previewPath === filePath && !transcoding) {
                    void runTranscodePreview(filePath);
                  }
                }}
              />
            )}
            {transcoding && (
              <div className="ve-preview-busy">Önizleme hazırlanıyor...</div>
            )}
            {/* Canli blur efekti — canvas'a video ciz + ctx.filter blur */}
            <canvas ref={canvasRef} className="ve-blur-canvas" />

            {/* Tum bolgelerin konturu — secilebilir, in/out range farki belli olsun */}
            {blurs.map((b) => {
              const r = videoToPreview(b.x, b.y, b.w, b.h);
              if (!r) return null;
              const active = isActive(b);
              const isSelected = b.id === selectedId;
              return (
                <div
                  key={`prev-${b.id}`}
                  className={`ve-blur-overlay ${b.mode} ${active ? "active" : "inactive"} ${isSelected ? "selected" : ""}`}
                  style={{
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                  }}
                  onMouseDown={(e) => startBlurMove(e, b)}
                  title={`#${blurs.indexOf(b) + 1} ${b.mode === "inside" ? "iç" : "dış"} bulanık — sürükle/yeniden boyutlandır`}
                >
                  {isSelected && (
                    <>
                      <div
                        className="ve-move-grip"
                        title="Taşı"
                        onMouseDown={(e) => startBlurMove(e, b)}
                      />
                      {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((c) => (
                        <div
                          key={c}
                          className={`ve-resize-handle h-${c}`}
                          onMouseDown={(e) => startBlurResize(e, b, c)}
                        />
                      ))}
                    </>
                  )}
                </div>
              );
            })}
            {drawing && (
              <div
                className="ve-drawing"
                style={{ left: drawing.x, top: drawing.y, width: drawing.w, height: drawing.h }}
              />
            )}
          </div>

          <div className="ve-controls">
            <button className="ve-btn" onClick={togglePlay} title="Oynat/Duraklat">
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <span className="ve-time">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.05}
              value={currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="ve-scrub"
            />
          </div>

          <Timeline
            duration={duration}
            currentTime={currentTime}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimChange={(s, e) => {
              setTrimStart(s);
              setTrimEnd(e);
            }}
            blurs={blurs}
            selectedId={selectedId}
            onSelectBlur={(id) => setSelectedId(id)}
            onBlurRangeChange={(id, s, e) =>
              updateBlur(id, { tStart: s, tEnd: e })
            }
            onSeek={seek}
          />

          <div className="ve-panel">
            <div className="ve-panel-section">
              <div className="ve-panel-title">Blur bölgeleri</div>
              <div className="ve-hint">
                Önizleme üzerine sürükleyerek bölge çiz. Listeden seçip ayarla.
              </div>
              {blurs.length === 0 && (
                <div className="ve-empty-mini">Henüz bölge yok.</div>
              )}
              {blurs.map((b, i) => (
                <div
                  key={b.id}
                  className={`ve-blur-row ${b.id === selectedId ? "selected" : ""}`}
                  onClick={() => setSelectedId(b.id)}
                >
                  <span className="ve-blur-tag">#{i + 1}</span>
                  <select
                    value={b.mode}
                    onChange={(e) =>
                      updateBlur(b.id, { mode: e.target.value as BlurMode })
                    }
                  >
                    <option value="inside">İç bulanık</option>
                    <option value="outside">Dış bulanık</option>
                  </select>
                  <label className="ve-inline">
                    <input
                      type="checkbox"
                      checked={b.tStart != null && b.tEnd != null}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateBlur(b.id, {
                            tStart: Math.max(0, currentTime - 1),
                            tEnd: Math.min(duration, currentTime + 2),
                          });
                        } else {
                          updateBlur(b.id, { tStart: null, tEnd: null });
                        }
                      }}
                    />{" "}
                    aralık
                  </label>
                  {b.tStart != null && b.tEnd != null && (
                    <span className="ve-range-text">
                      {fmtTime(b.tStart)} – {fmtTime(b.tEnd)}
                    </span>
                  )}
                  <button
                    className="ve-btn icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBlur(b.id);
                    }}
                    title="Sil"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {selected && (
                <div className="ve-blur-detail">
                  <label>
                    Şiddet:{" "}
                    <input
                      type="range"
                      min={2}
                      max={50}
                      value={selected.strength}
                      onChange={(e) =>
                        updateBlur(selected.id, { strength: parseInt(e.target.value) })
                      }
                    />{" "}
                    {selected.strength}
                  </label>
                  {selected.tStart != null && selected.tEnd != null && (
                    <div className="ve-range-edit">
                      <label>
                        Başlangıç (sn):{" "}
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          max={duration}
                          value={selected.tStart.toFixed(2)}
                          onChange={(e) =>
                            updateBlur(selected.id, { tStart: parseFloat(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        Bitiş (sn):{" "}
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          max={duration}
                          value={selected.tEnd.toFixed(2)}
                          onChange={(e) =>
                            updateBlur(selected.id, { tEnd: parseFloat(e.target.value) })
                          }
                        />
                      </label>
                      <button
                        className="ve-btn small"
                        onClick={() =>
                          updateBlur(selected.id, { tStart: currentTime })
                        }
                      >
                        Başlangıç = şu an
                      </button>
                      <button
                        className="ve-btn small"
                        onClick={() =>
                          updateBlur(selected.id, { tEnd: currentTime })
                        }
                      >
                        Bitiş = şu an
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="ve-panel-section">
              <div className="ve-panel-title">
                <Music size={12} /> Ses
              </div>
              {!audioPath && (
                <button className="ve-btn small" onClick={pickAudio}>
                  <Plus size={12} /> Ses ekle
                </button>
              )}
              {audioPath && (
                <div className="ve-audio">
                  <span className="ve-audio-path" title={audioPath}>
                    {audioPath.split(/[\\/]/).pop()}
                  </span>
                  <label>
                    Seviye:{" "}
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={audioVolume}
                      onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                    />{" "}
                    {audioVolume.toFixed(2)}
                  </label>
                  <label className="ve-inline">
                    <input
                      type="checkbox"
                      checked={audioReplace}
                      onChange={(e) => setAudioReplace(e.target.checked)}
                    />{" "}
                    orijinal sesi değiştir
                  </label>
                  <button className="ve-btn small" onClick={() => setAudioPath(null)}>
                    Kaldır
                  </button>
                </div>
              )}
            </div>

            <div className="ve-panel-section">
              <div className="ve-panel-title">Çıktı</div>
              <select value={format} onChange={(e) => setFormat(e.target.value as VideoOutputFormat)}>
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button
                className="ve-btn primary"
                onClick={handleExport}
                disabled={busy || !ffmpegOk}
              >
                {busy ? "İşleniyor..." : "Dışa aktar"}
              </button>
              {status && <div className="ve-status">{status}</div>}
              {error && <div className="ve-error">{error}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface TimelineProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (s: number, e: number) => void;
  blurs: BlurRegion[];
  selectedId: number | null;
  onSelectBlur: (id: number) => void;
  onBlurRangeChange: (id: number, s: number, e: number) => void;
  onSeek: (t: number) => void;
}

function Timeline({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  onTrimChange,
  blurs,
  selectedId,
  onSelectBlur,
  onBlurRangeChange,
  onSeek,
}: TimelineProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<
    | { kind: "trim-start" | "trim-end" | "playhead" }
    | { kind: "blur-start" | "blur-end" | "blur-move"; id: number; offset?: number }
    | null
  >(null);

  const pxToTime = (px: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !duration) return 0;
    return Math.max(0, Math.min(duration, (px / box.width) * duration));
  };
  const timeToPct = (t: number) => (duration ? (t / duration) * 100 : 0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      const t = pxToTime(e.clientX - box.left);
      if (drag.kind === "trim-start") {
        onTrimChange(Math.min(t, trimEnd - 0.1), trimEnd);
      } else if (drag.kind === "trim-end") {
        onTrimChange(trimStart, Math.max(t, trimStart + 0.1));
      } else if (drag.kind === "playhead") {
        onSeek(t);
      } else if (drag.kind === "blur-start" || drag.kind === "blur-end" || drag.kind === "blur-move") {
        const b = blurs.find((x) => x.id === drag.id);
        if (!b || b.tStart == null || b.tEnd == null) return;
        if (drag.kind === "blur-start") {
          onBlurRangeChange(drag.id, Math.min(t, b.tEnd - 0.1), b.tEnd);
        } else if (drag.kind === "blur-end") {
          onBlurRangeChange(drag.id, b.tStart, Math.max(t, b.tStart + 0.1));
        } else {
          const len = b.tEnd - b.tStart;
          let ns = t - (drag.offset ?? 0);
          ns = Math.max(0, Math.min(duration - len, ns));
          onBlurRangeChange(drag.id, ns, ns + len);
        }
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [duration, trimStart, trimEnd, blurs, onTrimChange, onBlurRangeChange, onSeek]);

  return (
    <div className="ve-timeline" ref={ref}>
      <div
        className="ve-tl-track"
        onMouseDown={(e) => {
          const box = ref.current?.getBoundingClientRect();
          if (!box) return;
          onSeek(pxToTime(e.clientX - box.left));
          dragRef.current = { kind: "playhead" };
        }}
      >
        {/* Trim disi sol/sag karartma */}
        <div
          className="ve-tl-mask"
          style={{ left: 0, width: `${timeToPct(trimStart)}%` }}
        />
        <div
          className="ve-tl-mask"
          style={{
            left: `${timeToPct(trimEnd)}%`,
            width: `${100 - timeToPct(trimEnd)}%`,
          }}
        />

        {/* Blur segmentleri */}
        {blurs
          .filter((b) => b.tStart != null && b.tEnd != null)
          .map((b) => (
            <div
              key={`seg-${b.id}`}
              className={`ve-tl-blur ${b.mode} ${b.id === selectedId ? "selected" : ""}`}
              style={{
                left: `${timeToPct(b.tStart!)}%`,
                width: `${timeToPct(b.tEnd! - b.tStart!)}%`,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelectBlur(b.id);
                const box = ref.current?.getBoundingClientRect();
                if (!box) return;
                const t = pxToTime(e.clientX - box.left);
                dragRef.current = {
                  kind: "blur-move",
                  id: b.id,
                  offset: t - b.tStart!,
                };
              }}
            >
              <div
                className="ve-tl-handle left"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectBlur(b.id);
                  dragRef.current = { kind: "blur-start", id: b.id };
                }}
              />
              <div
                className="ve-tl-handle right"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectBlur(b.id);
                  dragRef.current = { kind: "blur-end", id: b.id };
                }}
              />
            </div>
          ))}

        {/* Playhead */}
        <div
          className="ve-tl-playhead"
          style={{ left: `${timeToPct(currentTime)}%` }}
        />

        {/* Trim handles */}
        <div
          className="ve-tl-trim left"
          style={{ left: `${timeToPct(trimStart)}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            dragRef.current = { kind: "trim-start" };
          }}
        />
        <div
          className="ve-tl-trim right"
          style={{ left: `${timeToPct(trimEnd)}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            dragRef.current = { kind: "trim-end" };
          }}
        />
      </div>
      <div className="ve-tl-meta">
        <span>Kesim: {fmtTime(trimStart)} – {fmtTime(trimEnd)}</span>
      </div>
    </div>
  );
}
