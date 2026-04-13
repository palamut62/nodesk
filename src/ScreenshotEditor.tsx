import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  X,
  Type,
  Square,
  ArrowUpRight,
  Droplets,
  EyeOff,
  Save,
  Undo2,
  Redo2,
  Palette,
  Loader2,
  Trash2,
  Copy,
  MousePointer2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "./lib/i18n";

type Tool = "select" | "text" | "rect" | "arrow" | "blur" | "blur-inverse";
type AnnotationType = "text" | "rect" | "arrow" | "blur" | "blur-inverse";

interface Annotation {
  id: number;
  type: AnnotationType;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: "normal" | "italic";
  fontWeight?: "400" | "700";
  underline?: boolean;
  textAlign?: "left" | "center" | "right";
  x2?: number;
  y2?: number;
}

interface DragState {
  id: number;
  pointerX: number;
  pointerY: number;
  original: Annotation;
}

const COLORS = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#ffffff", "#000000"];
const DEFAULT_TEXT = "Yazi";
const DEFAULT_FONT_SIZE = 28;
const FONT_OPTIONS = [
  { value: "Arial", label: "Arial" },
  { value: "Georgia", label: "Georgia" },
  { value: "Trebuchet MS", label: "Trebuchet" },
  { value: "Courier New", label: "Courier" },
  { value: "Verdana", label: "Verdana" },
];

interface Props {
  imageBase64: string;
  onClose: () => void;
}

function cloneAnnotations(items: Annotation[]) {
  return items.map((item) => ({ ...item }));
}

function clampRect(x: number, y: number, w: number, h: number, maxW: number, maxH: number) {
  const nx = Math.max(0, Math.min(x, maxW - Math.max(1, w)));
  const ny = Math.max(0, Math.min(y, maxH - Math.max(1, h)));
  return { x: nx, y: ny };
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function buildCanvasFont(ann: Annotation, size: number) {
  const style = ann.fontStyle ?? "normal";
  const weight = ann.fontWeight ?? "700";
  const family = ann.fontFamily ?? "Arial";
  return `${style} ${weight} ${size}px "${family}"`;
}

export default function ScreenshotEditor({ imageBase64, onClose }: Props) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#e53935");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [nextId, setNextId] = useState(1);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [scale, setScale] = useState(1);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const maxW = 860;
      const maxH = 560;
      const nextScale = Math.min(maxW / img.width, maxH / img.height, 1);
      setScale(nextScale);
      setImgSize({ w: img.width, h: img.height });
    };
    img.onerror = (e) => {
      console.error("[screenshot] image load failed", e);
    };
    img.src = `data:image/png;base64,${imageBase64}`;
  }, [imageBase64]);

  const measureTextBox = useCallback((ann: Annotation) => {
    const text = ann.text?.length ? ann.text : DEFAULT_TEXT;
    const fontSize = ann.fontSize ?? DEFAULT_FONT_SIZE;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      const fallbackWidth = Math.max(fontSize * 1.8, text.length * fontSize * 0.58);
      return { width: fallbackWidth, height: fontSize * 1.35 };
    }
    ctx.font = buildCanvasFont(ann, fontSize);
    const lines = text.split("\n");
    const width = Math.max(
      fontSize * 1.8,
      ...lines.map((line) => ctx.measureText(line || " ").width),
    );
    const lineHeight = fontSize * 1.35;
    const height = Math.max(lineHeight, lines.length * lineHeight);
    return { width, height };
  }, []);

  const getBounds = useCallback(
    (ann: Annotation) => {
      if (ann.type === "arrow") {
        const x1 = ann.x;
        const y1 = ann.y;
        const x2 = ann.x2 ?? ann.x;
        const y2 = ann.y2 ?? ann.y;
        return {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
        };
      }

      if (ann.type === "text") {
        const box = measureTextBox(ann);
        return {
          x: ann.x,
          y: ann.y - box.height + 6,
          w: box.width,
          h: box.height,
        };
      }

      return { x: ann.x, y: ann.y, w: ann.w, h: ann.h };
    },
    [measureTextBox],
  );

  const drawSelection = useCallback(
    (ctx: CanvasRenderingContext2D, ann: Annotation) => {
      const bounds = getBounds(ann);
      ctx.save();
      ctx.strokeStyle = "rgba(30, 136, 229, 0.95)";
      ctx.fillStyle = "rgba(30, 136, 229, 0.08)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
      ctx.setLineDash([]);
      ctx.fillRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
      ctx.restore();
    },
    [getBounds],
  );

  const drawAnnotation = useCallback(
    (ctx: CanvasRenderingContext2D, ann: Annotation, s: number) => {
      const x = ann.x * s;
      const y = ann.y * s;
      const w = ann.w * s;
      const h = ann.h * s;

      switch (ann.type) {
        case "rect":
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = 3 * s;
          ctx.strokeRect(x, y, w, h);
          break;
        case "text": {
          const fontSize = (ann.fontSize ?? DEFAULT_FONT_SIZE) * s;
          const drawFontSize = Math.max(14, fontSize);
          ctx.font = buildCanvasFont(ann, drawFontSize);
          ctx.fillStyle = ann.color;
          ctx.textBaseline = "top";
          ctx.textAlign = ann.textAlign ?? "left";
          const lines = (ann.text?.length ? ann.text : DEFAULT_TEXT).split("\n");
          const lineHeight = drawFontSize * 1.35;
          const anchorX =
            ann.textAlign === "center"
              ? x + measureTextBox(ann).width * s * 0.5
              : ann.textAlign === "right"
                ? x + measureTextBox(ann).width * s
                : x;
          const topY = y - lineHeight + 6 * s;
          lines.forEach((line, index) => {
            const drawY = topY + index * lineHeight;
            const value = line || " ";
            ctx.fillText(value, anchorX, drawY);
            if (ann.underline) {
              const metrics = ctx.measureText(value);
              const lineWidth = metrics.width;
              let startX = anchorX;
              if ((ann.textAlign ?? "left") === "center") startX -= lineWidth / 2;
              if ((ann.textAlign ?? "left") === "right") startX -= lineWidth;
              const underlineY = drawY + drawFontSize + 2 * s;
              ctx.beginPath();
              ctx.lineWidth = Math.max(1, s * 2);
              ctx.strokeStyle = ann.color;
              ctx.moveTo(startX, underlineY);
              ctx.lineTo(startX + lineWidth, underlineY);
              ctx.stroke();
            }
          });
          break;
        }
        case "arrow": {
          const x2 = (ann.x2 ?? ann.x) * s;
          const y2 = (ann.y2 ?? ann.y) * s;
          ctx.strokeStyle = ann.color;
          ctx.fillStyle = ann.color;
          ctx.lineWidth = 3 * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          const angle = Math.atan2(y2 - y, x2 - x);
          const headLen = 14 * s;
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
    },
    [measureTextBox],
  );

  const redrawBase = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    for (const ann of annotations) {
      drawAnnotation(ctx, ann, 1);
    }
  }, [annotations, drawAnnotation]);

  const redrawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !imgSize) return;
    overlay.width = imgSize.w;
    overlay.height = imgSize.h;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (drawing) {
      if (tool === "rect" || tool === "blur" || tool === "blur-inverse") {
        ctx.strokeStyle = tool === "rect" ? color : "rgba(30, 136, 229, 0.8)";
        ctx.lineWidth = 3;
        ctx.setLineDash(tool === "rect" ? [] : [8, 5]);
        ctx.strokeRect(startPos.x, startPos.y, currentPos.x - startPos.x, currentPos.y - startPos.y);
        ctx.setLineDash([]);
      } else if (tool === "arrow") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(currentPos.x, currentPos.y);
        ctx.stroke();
      }
    }

    const selected = annotations.find((ann) => ann.id === selectedId);
    if (selected) {
      drawSelection(ctx, selected);
    }
  }, [annotations, color, currentPos, drawSelection, drawing, imgSize, selectedId, startPos, tool]);

  useEffect(() => {
    redrawBase();
  }, [imgSize, redrawBase]);

  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay]);

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

    let clearData: ImageData | null = null;
    if (rw > 0 && rh > 0) {
      clearData = ctx.getImageData(rx, ry, Math.min(rw, cw - rx), Math.min(rh, ch - ry));
    }

    const fullData = ctx.getImageData(0, 0, cw, ch);
    pixelateImageData(fullData, 12);
    ctx.putImageData(fullData, 0, 0);

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
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let dy = 0; dy < blockSize && by + dy < h; dy++) {
          for (let dx = 0; dx < blockSize && bx + dx < w; dx++) {
            const i = ((by + dy) * w + (bx + dx)) * 4;
            r += d[i];
            g += d[i + 1];
            b += d[i + 2];
            count++;
          }
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        for (let dy = 0; dy < blockSize && by + dy < h; dy++) {
          for (let dx = 0; dx < blockSize && bx + dx < w; dx++) {
            const i = ((by + dy) * w + (bx + dx)) * 4;
            d[i] = r;
            d[i + 1] = g;
            d[i + 2] = b;
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

  const hitTest = useCallback(
    (x: number, y: number) => {
      for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        if (ann.type === "arrow") {
          const dist = distanceToSegment(x, y, ann.x, ann.y, ann.x2 ?? ann.x, ann.y2 ?? ann.y);
          if (dist <= 10) return ann;
          continue;
        }

        const bounds = getBounds(ann);
        if (
          x >= bounds.x - 6 &&
          x <= bounds.x + bounds.w + 6 &&
          y >= bounds.y - 6 &&
          y <= bounds.y + bounds.h + 6
        ) {
          return ann;
        }
      }
      return null;
    },
    [annotations, getBounds],
  );

  const updateAnnotation = (id: number, updater: (ann: Annotation) => Annotation) => {
    setAnnotations((prev) => prev.map((ann) => (ann.id === id ? updater(ann) : ann)));
  };

  const rememberSnapshot = useCallback(
    (snapshot = annotations) => {
      setUndoStack((prev) => [...prev, cloneAnnotations(snapshot)]);
      setRedoStack([]);
    },
    [annotations],
  );

  const addTextAnnotation = (x: number, y: number) => {
    rememberSnapshot();
    const ann: Annotation = {
      id: nextId,
      type: "text",
      x,
      y,
      w: 0,
      h: 0,
      color,
      text: DEFAULT_TEXT,
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: "Arial",
      fontStyle: "normal",
      fontWeight: "700",
      underline: false,
      textAlign: "left",
    };
    setAnnotations((prev) => [...prev, ann]);
    setSelectedId(ann.id);
    setTool("select");
    setNextId((n) => n + 1);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getPos(e);

    if (tool === "text") {
      e.preventDefault();
      addTextAnnotation(pos.x, pos.y);
      setStatus(t("textEditorReady"));
      return;
    }

    if (tool === "select") {
      const hit = hitTest(pos.x, pos.y);
      if (!hit) {
        setSelectedId(null);
        return;
      }
      setSelectedId(hit.id);
      rememberSnapshot();
      setDragging({
        id: hit.id,
        pointerX: pos.x,
        pointerY: pos.y,
        original: { ...hit },
      });
      return;
    }

    setSelectedId(null);
    setStartPos(pos);
    setCurrentPos(pos);
    setDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getPos(e);

    if (dragging && imgSize) {
      const dx = pos.x - dragging.pointerX;
      const dy = pos.y - dragging.pointerY;
      updateAnnotation(dragging.id, (ann) => {
        const source = dragging.original;
        if (source.type === "arrow") {
          const x1 = source.x + dx;
          const y1 = source.y + dy;
          const x2 = (source.x2 ?? source.x) + dx;
          const y2 = (source.y2 ?? source.y) + dy;
          const minX = Math.min(x1, x2);
          const minY = Math.min(y1, y2);
          const maxX = Math.max(x1, x2);
          const maxY = Math.max(y1, y2);
          const shiftX =
            minX < 0 ? -minX : maxX > imgSize.w ? imgSize.w - maxX : 0;
          const shiftY =
            minY < 0 ? -minY : maxY > imgSize.h ? imgSize.h - maxY : 0;
          return {
            ...ann,
            x: x1 + shiftX,
            y: y1 + shiftY,
            x2: x2 + shiftX,
            y2: y2 + shiftY,
          };
        }

        const bounds = getBounds(source);
        const next = clampRect(bounds.x + dx, bounds.y + dy, bounds.w, bounds.h, imgSize.w, imgSize.h);
        if (source.type === "text") {
          const textHeight = bounds.h;
          return {
            ...ann,
            x: next.x,
            y: next.y + textHeight - 6,
          };
        }

        return {
          ...ann,
          x: next.x,
          y: next.y,
        };
      });
      return;
    }

    if (!drawing) return;
    setCurrentPos(pos);
  };

  const handleMouseUp = () => {
    if (dragging) {
      setDragging(null);
      return;
    }

    if (!drawing) return;
    setDrawing(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);

    if (w < 3 && h < 3 && tool !== "arrow") return;

    const ann: Annotation = {
      id: nextId,
      type: tool as AnnotationType,
      x,
      y,
      w,
      h,
      color,
      ...(tool === "arrow"
        ? { x: startPos.x, y: startPos.y, x2: currentPos.x, y2: currentPos.y, w: 0, h: 0 }
        : {}),
    };

    rememberSnapshot();
    setAnnotations((prev) => [...prev, ann]);
    setSelectedId(ann.id);
    setNextId((n) => n + 1);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = cloneAnnotations(undoStack[undoStack.length - 1]);
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, cloneAnnotations(annotations)]);
    setAnnotations(previous);
    setSelectedId(
      previous.some((ann) => ann.id === selectedId)
        ? selectedId
        : previous.length > 0
          ? previous[previous.length - 1].id
          : null,
    );
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = cloneAnnotations(redoStack[redoStack.length - 1]);
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, cloneAnnotations(annotations)]);
    setAnnotations(nextState);
    setSelectedId(
      nextState.some((ann) => ann.id === selectedId)
        ? selectedId
        : nextState.length > 0
          ? nextState[nextState.length - 1].id
          : null,
    );
  };

  const handleClear = () => {
    if (annotations.length === 0) return;
    rememberSnapshot();
    setAnnotations([]);
    setSelectedId(null);
  };

  const renderExportCanvas = useCallback(() => {
    const img = imgRef.current;
    if (!img) return null;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = img.width;
    exportCanvas.height = img.height;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    for (const ann of annotations) {
      drawAnnotation(ctx, ann, 1);
    }
    return exportCanvas;
  }, [annotations, drawAnnotation]);

  const handleSave = async () => {
    const exportCanvas = renderExportCanvas();
    if (!exportCanvas) return;

    setSaving(true);
    try {
      const path = await saveDialog({
        defaultPath: `screenshot-${Date.now()}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return;

      const dataUrl = exportCanvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const bytes = atob(base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      await invoke("write_binary_file", { path, data: Array.from(arr) });
      setStatus(t("saved"));
    } catch {
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

  const handleCopyImage = async () => {
    const exportCanvas = renderExportCanvas();
    if (!exportCanvas) return;

    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => exportCanvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus(t("copiedImage"));
    } catch (err) {
      console.error("[screenshot] copy failed", err);
      setStatus(t("copyFailed"));
    } finally {
      setSaving(false);
    }
  };

  const selectedAnnotation = annotations.find((ann) => ann.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedAnnotation) return;
    setColor(selectedAnnotation.color);
  }, [selectedAnnotation]);

  useEffect(() => {
    if (!selectedAnnotation) return;
    updateAnnotation(selectedAnnotation.id, (ann) => ({ ...ann, color }));
  }, [color]); // selectedAnnotation intentionally from closure on current render

  const fullW = imgSize ? imgSize.w : 860;
  const fullH = imgSize ? imgSize.h : 560;
  const dispW = Math.round(fullW * scale);
  const dispH = Math.round(fullH * scale);

  const toolBtn = (nextTool: Tool, icon: ReactNode, label: string) => (
    <button
      className={`screenshot-tool-btn ${tool === nextTool ? "active" : ""}`}
      onClick={() => setTool(nextTool)}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );

  const showTextEditor = selectedAnnotation?.type === "text";
  const textStyleBtn = (
    active: boolean,
    icon: ReactNode,
    title: string,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className={`screenshot-text-style-btn ${active ? "active" : ""}`}
      title={title}
      onClick={onClick}
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
          {toolBtn("select", <MousePointer2 size={15} />, t("selectMove"))}
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
            <span className="screenshot-color-dot" style={{ background: color }} />
            <input
              type="color"
              value={color}
              onChange={(e) => {
                if (selectedAnnotation) rememberSnapshot();
                setColor(e.target.value);
              }}
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
              onClick={() => {
                if (selectedAnnotation) rememberSnapshot();
                setColor(c);
              }}
              title={c}
              type="button"
            />
          ))}

          {showTextEditor && (
            <>
              <div className="screenshot-separator" />
              <div className="screenshot-text-toolbar">
                <textarea
                  className="screenshot-text-toolbar-input"
                  value={selectedAnnotation.text ?? DEFAULT_TEXT}
                  onChange={(e) => {
                    rememberSnapshot();
                    updateAnnotation(selectedAnnotation.id, (ann) => ({
                      ...ann,
                      text: e.target.value,
                    }));
                  }}
                  placeholder={t("textContent")}
                  rows={2}
                />
                <select
                  className="screenshot-text-toolbar-select"
                  value={selectedAnnotation.fontFamily ?? "Arial"}
                  onChange={(e) => {
                    rememberSnapshot();
                    updateAnnotation(selectedAnnotation.id, (ann) => ({
                      ...ann,
                      fontFamily: e.target.value,
                    }));
                  }}
                >
                  {FONT_OPTIONS.map((font) => (
                    <option key={font.value} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </select>
                <label className="screenshot-text-toolbar-size">
                  <span>{t("textSize")}</span>
                  <input
                    type="range"
                    min={14}
                    max={72}
                    value={selectedAnnotation.fontSize ?? DEFAULT_FONT_SIZE}
                    onChange={(e) => {
                      rememberSnapshot();
                      updateAnnotation(selectedAnnotation.id, (ann) => ({
                        ...ann,
                        fontSize: Number(e.target.value),
                      }));
                    }}
                  />
                </label>
                <div className="screenshot-text-style-group">
                  {textStyleBtn(
                    (selectedAnnotation.fontWeight ?? "700") === "700",
                    <Bold size={14} />,
                    t("bold"),
                    () => {
                      rememberSnapshot();
                      updateAnnotation(selectedAnnotation.id, (ann) => ({
                        ...ann,
                        fontWeight: (ann.fontWeight ?? "700") === "700" ? "400" : "700",
                      }));
                    },
                  )}
                  {textStyleBtn(
                    (selectedAnnotation.fontStyle ?? "normal") === "italic",
                    <Italic size={14} />,
                    t("italic"),
                    () => {
                      rememberSnapshot();
                      updateAnnotation(selectedAnnotation.id, (ann) => ({
                        ...ann,
                        fontStyle: (ann.fontStyle ?? "normal") === "italic" ? "normal" : "italic",
                      }));
                    },
                  )}
                  {textStyleBtn(
                    Boolean(selectedAnnotation.underline),
                    <UnderlineIcon size={14} />,
                    t("underline"),
                    () => {
                      rememberSnapshot();
                      updateAnnotation(selectedAnnotation.id, (ann) => ({
                        ...ann,
                        underline: !ann.underline,
                      }));
                    },
                  )}
                </div>
                <div className="screenshot-text-style-group">
                  {textStyleBtn(
                    (selectedAnnotation.textAlign ?? "left") === "left",
                    <AlignLeft size={14} />,
                    t("alignLeft"),
                    () => {
                      rememberSnapshot();
                      updateAnnotation(selectedAnnotation.id, (ann) => ({
                        ...ann,
                        textAlign: "left",
                      }));
                    },
                  )}
                  {textStyleBtn(
                    (selectedAnnotation.textAlign ?? "left") === "center",
                    <AlignCenter size={14} />,
                    t("alignCenter"),
                    () => {
                      rememberSnapshot();
                      updateAnnotation(selectedAnnotation.id, (ann) => ({
                        ...ann,
                        textAlign: "center",
                      }));
                    },
                  )}
                  {textStyleBtn(
                    (selectedAnnotation.textAlign ?? "left") === "right",
                    <AlignRight size={14} />,
                    t("alignRight"),
                    () => {
                      rememberSnapshot();
                      updateAnnotation(selectedAnnotation.id, (ann) => ({
                        ...ann,
                        textAlign: "right",
                      }));
                    },
                  )}
                </div>
              </div>
            </>
          )}

          <div style={{ flex: 1 }} />

          <button
            className="screenshot-tool-btn"
            onClick={handleUndo}
            title="Undo"
            disabled={undoStack.length === 0}
            type="button"
          >
            <Undo2 size={15} />
          </button>
          <button
            className="screenshot-tool-btn"
            onClick={handleRedo}
            title="Redo"
            disabled={redoStack.length === 0}
            type="button"
          >
            <Redo2 size={15} />
          </button>
          <button
            className="screenshot-tool-btn"
            onClick={handleClear}
            title="Clear"
            disabled={annotations.length === 0}
            type="button"
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
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: dispW,
                height: dispH,
                cursor: tool === "select" ? (dragging ? "grabbing" : "grab") : "crosshair",
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
        </div>

        <div className="editor-footer">
          <div className="status">
            {status ||
              (annotations.length > 0
                ? `${annotations.length} ${t("annotationCount")}`
                : tool === "select"
                  ? t("selectMoveHint")
                  : t("screenshotHint"))}
          </div>
          <button className="btn ghost" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="btn ghost" onClick={() => void handleCopyImage()} disabled={saving}>
            <Copy size={14} /> {t("copy")}
          </button>
          <button className="btn primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
