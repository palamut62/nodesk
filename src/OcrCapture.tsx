import { useCallback, useEffect, useRef, useState } from "react";
import { X, Copy, Loader2, RotateCcw, Check } from "lucide-react";
import WindowControls from "./components/WindowControls";
import { aiFixText, ocrImage, saveNote } from "./lib/tauri";

interface Props {
  imageBase64: string;
  onClose: () => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type StageState = "idle" | "active" | "done";

function Stage({ label, state }: { label: string; state: StageState }) {
  const color = state === "done" ? "#43a047" : state === "active" ? "#1e88e5" : "#bbb";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 16, height: 16, borderRadius: "50%",
        background: state === "active" ? "transparent" : color,
        border: `2px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 10,
      }}>
        {state === "active" && <Loader2 size={11} className="spin" style={{ color }} />}
        {state === "done" && <Check size={11} />}
      </span>
      <span style={{ color, fontWeight: state === "active" ? 600 : 400 }}>{label}</span>
    </div>
  );
}

function StageLine({ done }: { done: boolean }) {
  return (
    <span style={{
      flex: "0 0 24px", height: 2, borderRadius: 1,
      background: done ? "#43a047" : "#ddd",
    }} />
  );
}

export default function OcrCapture({ imageBase64, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [cur, setCur] = useState({ x: 0, y: 0 });
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.width, h: img.height });
    };
    img.src = `data:image/png;base64,${imageBase64}`;
  }, [imageBase64]);

  // Container boyutuna gore scale'i dinamik hesapla — pencere buyuyunce canvas da buyusun.
  useEffect(() => {
    if (!imgSize) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const compute = () => {
      const cw = wrap.clientWidth - 8;
      // Card alanini koru: container yuksekliginin ~%55'i kadar canvas.
      const ch = Math.max(220, wrap.clientHeight * 0.6);
      const s = Math.min(cw / imgSize.w, ch / imgSize.h, 1);
      setScale(s > 0 ? s : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [imgSize]);

  const drawBase = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
  }, []);

  const drawOverlay = useCallback(() => {
    const ov = overlayRef.current;
    if (!ov || !imgSize) return;
    ov.width = imgSize.w;
    ov.height = imgSize.h;
    const ctx = ov.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, ov.width, ov.height);

    let r: Rect | null = null;
    if (drawing) {
      r = {
        x: Math.min(start.x, cur.x),
        y: Math.min(start.y, cur.y),
        w: Math.abs(cur.x - start.x),
        h: Math.abs(cur.y - start.y),
      };
    } else if (rect) {
      r = rect;
    }

    // Karart, sadece seçimi şeffaf bırak
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, ov.width, ov.height);
    if (r && r.w > 0 && r.h > 0) {
      ctx.clearRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#1e88e5";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }, [drawing, start, cur, rect, imgSize]);

  useEffect(() => { drawBase(); }, [imgSize, drawBase]);
  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  const getPos = (e: React.MouseEvent) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / scale,
      y: (e.clientY - r.top) / scale,
    };
  };

  const onDown = (e: React.MouseEvent) => {
    if (busy) return;
    const p = getPos(e);
    setStart(p);
    setCur(p);
    setRect(null);
    setText("");
    setError("");
    setDrawing(true);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    setCur(getPos(e));
  };
  const onUp = async () => {
    if (!drawing) return;
    setDrawing(false);
    const r: Rect = {
      x: Math.round(Math.min(start.x, cur.x)),
      y: Math.round(Math.min(start.y, cur.y)),
      w: Math.round(Math.abs(cur.x - start.x)),
      h: Math.round(Math.abs(cur.y - start.y)),
    };
    if (r.w < 6 || r.h < 6) return;
    setRect(r);
    await runOcr(r);
  };

  const runOcr = async (r: Rect) => {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    setError("");
    setText("");
    let raw = "";
    try {
      const tmp = document.createElement("canvas");
      tmp.width = r.w;
      tmp.height = r.h;
      const ctx = tmp.getContext("2d");
      if (!ctx) throw new Error("canvas ctx yok");
      ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      const blob = await new Promise<Blob | null>((res) => tmp.toBlob(res, "image/png"));
      if (!blob) throw new Error("PNG kodlama hatasi");
      const buf = new Uint8Array(await blob.arrayBuffer());
      raw = (await ocrImage(Array.from(buf))).trim();
      setText(raw);
      if (!raw) {
        setError("Bu bolgede metin bulunamadi");
        return;
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      return;
    } finally {
      setBusy(false);
    }

    // OCR ham metnini AI ile otomatik duzelt (yazim hatalari, satir sonlari).
    setAiBusy(true);
    try {
      const fixed = (await aiFixText(raw, "ocr")).trim();
      if (fixed && !fixed.startsWith("[HATA]")) {
        setText(fixed);
      }
    } catch {
      // AI basarisizsa ham metin kalir, hata gosterme.
    } finally {
      setAiBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleSaveNote = async () => {
    if (!text) return;
    const now = new Date();
    const title = `OCR · ${now.toLocaleString("tr-TR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    })}`;
    const html = text.split(/\n+/).map((l) => `<p>${l.trim()}</p>`).join("");
    await saveNote(null, title, html);
    onClose();
  };

  const handleReset = () => {
    setRect(null);
    setText("");
    setError("");
  };

  const fullW = imgSize?.w ?? 860;
  const fullH = imgSize?.h ?? 520;
  const dispW = Math.round(fullW * scale);
  const dispH = Math.round(fullH * scale);

  return (
    <div className="editor-shell">
      <div className="editor-card">
        <div className="editor-titlebar">
          <div style={{ width: 78 }} />
          <div className="title">OCR · Metin yakala</div>
          <WindowControls />
          <button onClick={onClose} title="Kapat"><X size={14} /></button>
        </div>

        <div ref={wrapRef} className="screenshot-canvas-wrap" style={{ flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
          <div style={{ position: "relative", width: dispW, height: dispH }}>
            <canvas
              ref={canvasRef}
              width={fullW}
              height={fullH}
              style={{ position: "absolute", top: 0, left: 0, width: dispW, height: dispH }}
            />
            <canvas
              ref={overlayRef}
              width={fullW}
              height={fullH}
              style={{
                position: "absolute", top: 0, left: 0,
                width: dispW, height: dispH,
                cursor: busy ? "wait" : "crosshair",
              }}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
            />
          </div>

          <div
            style={{
              width: dispW,
              background: "#ffffff",
              border: `1px solid ${error ? "#e53935" : "#e5e5ea"}`,
              borderRadius: 12,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", borderBottom: "1px solid #f0f0f3",
              background: "#fafafa", fontSize: 11, color: "#888", letterSpacing: 0.3,
              textTransform: "uppercase",
            }}>
              <span>Çıkarılan metin</span>
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!text || busy || aiBusy}
                title="Panoya kopyala"
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "transparent", border: "1px solid transparent",
                  padding: "4px 6px", borderRadius: 6,
                  cursor: !text || busy || aiBusy ? "default" : "pointer",
                  color: copied ? "#43a047" : "#1e88e5",
                  opacity: !text || busy || aiBusy ? 0.4 : 1,
                  fontSize: 11, fontWeight: 600, textTransform: "none",
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>
            <textarea
              readOnly={busy}
              value={busy ? "" : text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                busy
                  ? "OCR çalışıyor…"
                  : error
                    ? error
                    : "Metni içeren alanı fareyle seç."
              }
              style={{
                width: "100%", minHeight: 160, maxHeight: 280, resize: "vertical",
                background: "#ffffff", border: "none",
                padding: 14, overflow: "auto",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 13, lineHeight: 1.5,
                whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#1d1d1f",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          {(busy || aiBusy || (rect && text)) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "6px 4px", fontSize: 12, color: "#555",
            }}>
              <Stage label="Yakalama" state={rect ? "done" : "idle"} />
              <StageLine done={!busy && (text !== "" || aiBusy)} />
              <Stage label="OCR" state={busy ? "active" : text ? "done" : "idle"} />
              <StageLine done={!aiBusy && !busy && text !== "" ? true : false} />
              <Stage label="AI düzeltme" state={aiBusy ? "active" : (!busy && !aiBusy && text) ? "done" : "idle"} />
            </div>
          )}
        </div>

        <div className="editor-footer">
          <div className="status">
            {rect ? `${rect.w}×${rect.h} px` : "Bir bölge seç"}
          </div>
          <button className="btn ghost" onClick={handleReset} disabled={busy || aiBusy || !rect}>
            <RotateCcw size={14} /> Yeniden seç
          </button>
          <button className="btn primary" onClick={() => void handleSaveNote()} disabled={!text || busy || aiBusy}>
            Nota kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
