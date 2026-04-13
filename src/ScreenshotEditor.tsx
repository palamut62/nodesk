import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, Type, Square, ArrowUpRight, Droplets, EyeOff,
  Save, Undo2, Palette, Loader2, Trash2,
} from "lucide-react";
import { useT } from "./lib/i18n";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

type Tool = "select" | "text" | "rect" | "arrow" | "blur" | "blur-inverse";

interface Annotation {
  id: number;
  type: "text" | "rect" | "arrow" | "blur" | "blur-inverse";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string;
  // arrow endpoint
  x2?: number;
  y2?: number;
}

const COLORS = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#ffffff", "#000000"];

interface Props {
  imageBase64: string;
  onClose: () => void;
}

export default function ScreenshotEditor({ imageBase64, onClose }: Props) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#e53935");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [nextId, setNextId] = useState(1);
  const [saving, setSaving] = useState(false);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [scale, setScale] = useState(1);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const maxW = 860;
      const maxH = 560;
      const s = Math.min(maxW / img.width, maxH / img.height, 1);
      setScale(s);
      setImgSize({ w: img.width, h: img.height });
    };
    img.onerror = (e) => {
      console.error("[screenshot] image load failed", e);
    };
    img.src = `data:image/png;base64,${imageBase64}`;
  }, [imageBase64]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    for (const ann of annotations) {
      drawAnnotation(ctx, ann, 1);
    }
  }, [annotations]);

  useEffect(() => { redraw(); }, [redraw, imgSize]);

  const drawAnnotation = (ctx: CanvasRenderingContext2D, ann: Annotation, s: number) => {
    const x = ann.x * s;
    const y = ann.y * s;
    const w = ann.w * s;
    const h = ann.h * s;

    switch (ann.type) {
      case "rect":
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
        break;
      case "text":
        ctx.font = `bold ${Math.max(16, 18 * s)}px sans-serif`;
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text || "", x, y);
        break;
      case "arrow": {
        const x2 = (ann.x2 ?? ann.x) * s;
        const y2 = (ann.y2 ?? ann.y) * s;
        ctx.strokeStyle = ann.color;
        ctx.fillStyle = ann.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(y2 - y, x2 - x);
        const headLen = 14;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
        ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "blur":
        applyBlurRegion(ctx, x, y, w, h);
        break;
      case "blur-inverse":
        applyBlurInverse(ctx, x, y, w, h);
        break;
    }
  };

  const applyBlurRegion = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    if (w === 0 || h === 0) return;
    const rx = Math.max(0, Math.round(x));
    const ry = Math.max(0, Math.round(y));
    const rw = Math.min(Math.round(Math.abs(w)), ctx.canvas.width - rx);
    const rh = Math.min(Math.round(Math.abs(h)), ctx.canvas.height - ry);
    if (rw <= 0 || rh <= 0) return;
    const imageData = ctx.getImageData(rx, ry, rw, rh);
    pixelateImageData(imageData, 12);
    ctx.putImageData(imageData, rx, ry);
  };

  const applyBlurInverse = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const rx = Math.max(0, Math.round(x));
    const ry = Math.max(0, Math.round(y));
    const rw = Math.round(Math.abs(w));
    const rh = Math.round(Math.abs(h));

    // Save the clear region
    let clearData: ImageData | null = null;
    if (rw > 0 && rh > 0) {
      clearData = ctx.getImageData(rx, ry, Math.min(rw, cw - rx), Math.min(rh, ch - ry));
    }

    // Pixelate entire canvas
    const fullData = ctx.getImageData(0, 0, cw, ch);
    pixelateImageData(fullData, 12);
    ctx.putImageData(fullData, 0, 0);

    // Restore clear region
    if (clearData) {
      ctx.putImageData(clearData, rx, ry);
    }
  };

  const pixelateImageData = (data: ImageData, blockSize: number) => {
    const w = data.width;
    const h = data.height;
    const d = data.data;
    for (let by = 0; by < h; by += blockSize) {
      for (let bx = 0; bx < w; bx += blockSize) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = 0; dy < blockSize && by + dy < h; dy++) {
          for (let dx = 0; dx < blockSize && bx + dx < w; dx++) {
            const i = ((by + dy) * w + (bx + dx)) * 4;
            r += d[i]; g += d[i + 1]; b += d[i + 2]; count++;
          }
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        for (let dy = 0; dy < blockSize && by + dy < h; dy++) {
          for (let dx = 0; dx < blockSize && bx + dx < w; dx++) {
            const i = ((by + dy) * w + (bx + dx)) * 4;
            d[i] = r; d[i + 1] = g; d[i + 2] = b;
          }
        }
      }
    }
  };

  const getPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === "select") return;
    if (tool === "text") {
      e.preventDefault();
      const pos = getPos(e);
      setTextInput(pos);
      setTextValue("");
      return;
    }
    const pos = getPos(e);
    setStartPos(pos);
    setCurrentPos(pos);
    setDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const pos = getPos(e);
    setCurrentPos(pos);

    // Draw preview on overlay
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (tool === "rect" || tool === "blur" || tool === "blur-inverse") {
      ctx.strokeStyle = tool === "rect" ? color : "rgba(100,100,255,0.5)";
      ctx.lineWidth = 3 / scale;
      ctx.setLineDash(tool === "rect" ? [] : [6 / scale, 4 / scale]);
      ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
      ctx.setLineDash([]);
    } else if (tool === "arrow") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 / scale;
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const handleMouseUp = () => {
    if (!drawing) return;
    setDrawing(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);

    if (w < 3 && h < 3 && tool !== "arrow") return;

    const ann: Annotation = {
      id: nextId,
      type: tool as any,
      x, y, w, h,
      color,
      ...(tool === "arrow" ? { x: startPos.x, y: startPos.y, x2: currentPos.x, y2: currentPos.y, w: 0, h: 0 } : {}),
    };
    setAnnotations((prev) => [...prev, ann]);
    setNextId((n) => n + 1);

    // Clear overlay
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.getContext("2d")!.clearRect(0, 0, overlay.width, overlay.height);
    }
  };

  const addTextAnnotation = () => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      return;
    }
    const ann: Annotation = {
      id: nextId,
      type: "text",
      x: textInput.x,
      y: textInput.y,
      w: 0, h: 0,
      color,
      text: textValue,
    };
    setAnnotations((prev) => [...prev, ann]);
    setNextId((n) => n + 1);
    setTextInput(null);
    setTextValue("");
  };

  const handleUndo = () => {
    setAnnotations((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setAnnotations([]);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Render full resolution
    const img = imgRef.current;
    if (!img) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = img.width;
    exportCanvas.height = img.height;
    const ctx = exportCanvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    for (const ann of annotations) {
      drawAnnotation(ctx, ann, 1);
    }

    setSaving(true);
    try {
      const path = await saveDialog({
        defaultPath: `screenshot-${Date.now()}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) { setSaving(false); return; }

      const dataUrl = exportCanvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      // Write as binary via Rust
      const bytes = atob(base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      await invoke("write_binary_file", { path, data: Array.from(arr) });
    } catch (e: any) {
      // Fallback: download via blob
      try {
        exportCanvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `screenshot-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }, "image/png");
      } catch {}
    } finally {
      setSaving(false);
    }
  };

  const fullW = imgSize ? imgSize.w : 860;
  const fullH = imgSize ? imgSize.h : 560;
  const dispW = Math.round(fullW * scale);
  const dispH = Math.round(fullH * scale);

  const toolBtn = (t2: Tool, icon: any, label: string) => (
    <button
      className={`screenshot-tool-btn ${tool === t2 ? "active" : ""}`}
      onClick={() => setTool(t2)}
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <div className="editor-shell">
      <div className="editor-card">
        <div className="editor-titlebar">
          <div style={{ width: 26 }} />
          <div className="title">{t("screenshot")}</div>
          <button onClick={onClose} title={t("close")}>
            <X size={14} />
          </button>
        </div>

        <div className="screenshot-toolbar">
          {toolBtn("rect", <Square size={15} />, t("addRect"))}
          {toolBtn("arrow", <ArrowUpRight size={15} />, t("addArrow"))}
          {toolBtn("text", <Type size={15} />, t("addText"))}
          {toolBtn("blur", <Droplets size={15} />, t("blur"))}
          {toolBtn("blur-inverse", <EyeOff size={15} />, t("blurInverse"))}

          <div className="screenshot-separator" />

          <label
            className="screenshot-tool-btn"
            title={t("color")}
            style={{ position: "relative", cursor: "pointer" }}
          >
            <Palette size={15} />
            <span
              className="screenshot-color-dot"
              style={{ background: color }}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                cursor: "pointer",
                border: 0,
                padding: 0,
              }}
            />
          </label>

          {COLORS.map((c) => (
            <button
              key={c}
              className={`screenshot-color-swatch ${color === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}

          <div style={{ flex: 1 }} />

          <button
            className="screenshot-tool-btn"
            onClick={handleUndo}
            title="Undo"
            disabled={annotations.length === 0}
          >
            <Undo2 size={15} />
          </button>
          <button
            className="screenshot-tool-btn"
            onClick={handleClear}
            title="Clear"
            disabled={annotations.length === 0}
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div className="screenshot-canvas-wrap">
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
              style={{ position: "absolute", top: 0, left: 0, width: dispW, height: dispH, cursor: tool === "select" ? "default" : "crosshair" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            />
          </div>
          {textInput && (
            <input
              autoFocus
              className="screenshot-text-input"
              style={{
                left: textInput.x * scale,
                top: textInput.y * scale - 20,
                color,
              }}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTextAnnotation();
                if (e.key === "Escape") setTextInput(null);
              }}
              onBlur={addTextAnnotation}
            />
          )}
        </div>

        <div className="editor-footer">
          <div className="status">
            {annotations.length > 0
              ? `${annotations.length} annotation`
              : ""}
          </div>
          <button className="btn ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
