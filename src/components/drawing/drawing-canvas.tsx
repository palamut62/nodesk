import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import type { DrawOp, DrawTool } from '@/lib/types';

export interface DrawingCanvasHandle {
  undo: () => void;
  clear: () => void;
  deleteSelected: () => void;
  getCanvas: () => HTMLCanvasElement | null;
  renderOpsToCanvas: (target: HTMLCanvasElement) => void;
}

interface SelectionBounds { x: number; y: number; w: number; h: number }

interface Props {
  ops: DrawOp[];
  onOpsChange: (ops: DrawOp[]) => void;
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  active: boolean;
  onSelectionChange?: (id: string | null, bounds: SelectionBounds | null) => void;
}

/* ─── Geometry helpers ─────────────────────────────────────────────────── */

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitTest(op: DrawOp, px: number, py: number): boolean {
  const TOL = 10;
  switch (op.type) {
    case 'pen':
    case 'highlight':
    case 'eraser': {
      const hw = op.width / 2 + TOL;
      for (let i = 0; i < op.pts.length - 2; i += 2) {
        if (distToSegment(px, py, op.pts[i], op.pts[i + 1], op.pts[i + 2], op.pts[i + 3]) < hw) return true;
      }
      return false;
    }
    case 'line':
    case 'arrow':
      return distToSegment(px, py, op.x1, op.y1, op.x2, op.y2) < op.width / 2 + TOL;
    case 'rect': {
      const x0 = Math.min(op.x, op.x + op.w) - TOL;
      const x1 = Math.max(op.x, op.x + op.w) + TOL;
      const y0 = Math.min(op.y, op.y + op.h) - TOL;
      const y1 = Math.max(op.y, op.y + op.h) + TOL;
      return px >= x0 && px <= x1 && py >= y0 && py <= y1;
    }
    case 'ellipse': {
      const dx = (px - op.cx) / (op.rx + TOL);
      const dy = (py - op.cy) / (op.ry + TOL);
      return dx * dx + dy * dy <= 1;
    }
    default: return false;
  }
}

function moveOp(op: DrawOp, dx: number, dy: number): DrawOp {
  switch (op.type) {
    case 'pen':
    case 'highlight':
    case 'eraser': {
      const pts = [...op.pts];
      for (let i = 0; i < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy; }
      return { ...op, pts };
    }
    case 'line':
    case 'arrow':
      return { ...op, x1: op.x1 + dx, y1: op.y1 + dy, x2: op.x2 + dx, y2: op.y2 + dy };
    case 'rect':
      return { ...op, x: op.x + dx, y: op.y + dy };
    case 'ellipse':
      return { ...op, cx: op.cx + dx, cy: op.cy + dy };
    default: return op;
  }
}

function getBounds(op: DrawOp): { x: number; y: number; w: number; h: number } {
  switch (op.type) {
    case 'pen':
    case 'highlight':
    case 'eraser': {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < op.pts.length; i += 2) {
        minX = Math.min(minX, op.pts[i]);     maxX = Math.max(maxX, op.pts[i]);
        minY = Math.min(minY, op.pts[i + 1]); maxY = Math.max(maxY, op.pts[i + 1]);
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'line':
    case 'arrow':
      return { x: Math.min(op.x1, op.x2), y: Math.min(op.y1, op.y2), w: Math.abs(op.x2 - op.x1), h: Math.abs(op.y2 - op.y1) };
    case 'rect':
      return { x: Math.min(op.x, op.x + op.w), y: Math.min(op.y, op.y + op.h), w: Math.abs(op.w), h: Math.abs(op.h) };
    case 'ellipse':
      return { x: op.cx - op.rx, y: op.cy - op.ry, w: op.rx * 2, h: op.ry * 2 };
    default: return { x: 0, y: 0, w: 0, h: 0 };
  }
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, op: DrawOp) {
  const PAD = 6;
  const b = getBounds(op);
  ctx.save();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.globalAlpha = 0.85;
  ctx.strokeRect(b.x - PAD, b.y - PAD, b.w + PAD * 2, b.h + PAD * 2);
  ctx.restore();
}

/* ─── Component ────────────────────────────────────────────────────────── */

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(
  function DrawingCanvas({ ops, onOpsChange, tool, color, strokeWidth, active, onSelectionChange }, ref) {
    const canvasRef     = useRef<HTMLCanvasElement>(null);
    const isDrawing     = useRef(false);
    const currentOp     = useRef<DrawOp | null>(null);
    const opsRef        = useRef(ops);
    opsRef.current = ops;

    // Move-tool state
    const selectedIdRef = useRef<string | null>(null);
    const movingOpRef   = useRef<DrawOp | null>(null);   // live preview during drag
    const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
    const [, forceRender] = useState(0); // trigger cursor recalc on hover
    const onSelectionChangeRef = useRef(onSelectionChange);
    onSelectionChangeRef.current = onSelectionChange;

    const notifySelection = useCallback((id: string | null) => {
      if (!onSelectionChangeRef.current) return;
      if (id === null) { onSelectionChangeRef.current(null, null); return; }
      const op = opsRef.current.find(o => o.id === id);
      if (!op) { onSelectionChangeRef.current(null, null); return; }
      const PAD = 6;
      const b = getBounds(op);
      onSelectionChangeRef.current(id, { x: b.x - PAD, y: b.y - PAD, w: b.w + PAD * 2, h: b.h + PAD * 2 });
    }, []);

    useImperativeHandle(ref, () => ({
      undo: () => { if (opsRef.current.length > 0) onOpsChange(opsRef.current.slice(0, -1)); },
      clear: () => {
        selectedIdRef.current = null;
        movingOpRef.current = null;
        notifySelection(null);
        onOpsChange([]);
      },
      deleteSelected: () => {
        const id = selectedIdRef.current;
        if (!id) return;
        onOpsChange(opsRef.current.filter(o => o.id !== id));
        selectedIdRef.current = null;
        movingOpRef.current = null;
        notifySelection(null);
      },
      getCanvas: () => canvasRef.current,
      renderOpsToCanvas: (target: HTMLCanvasElement) => {
        const ctx = target.getContext('2d');
        if (!ctx) return;
        for (const op of opsRef.current) renderOp(ctx, op);
      },
    }), [notifySelection, onOpsChange]);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const movingId = movingOpRef.current?.id ?? null;

      for (const op of opsRef.current) {
        if (op.id === movingId) continue; // skip original while dragging
        renderOp(ctx, op);
        // draw selection box for selected (non-moving) op
        if (op.id === selectedIdRef.current && !movingOpRef.current) {
          drawSelectionBox(ctx, op);
        }
      }

      // Draw current in-progress draw op
      if (currentOp.current) renderOp(ctx, currentOp.current);

      // Draw moving op with selection box
      if (movingOpRef.current) {
        renderOp(ctx, movingOpRef.current);
        drawSelectionBox(ctx, movingOpRef.current);
      }
    }, []);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const ro = new ResizeObserver(() => {
        canvas.width  = parent.offsetWidth;
        canvas.height = parent.offsetHeight;
        redraw();
      });
      ro.observe(parent);
      canvas.width  = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
      return () => ro.disconnect();
    }, [redraw]);

    useEffect(() => { redraw(); }, [ops, redraw]);

    // Deselect when switching away from move tool
    useEffect(() => {
      if (tool !== 'move') {
        selectedIdRef.current = null;
        movingOpRef.current   = null;
        dragOriginRef.current = null;
        notifySelection(null);
        redraw();
      }
    }, [tool, redraw, notifySelection]);

    useEffect(() => {
      if (!active) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          if (opsRef.current.length > 0) onOpsChange(opsRef.current.slice(0, -1));
        }
        // Delete/Backspace removes selected shape
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current && tool === 'move') {
          e.preventDefault();
          onOpsChange(opsRef.current.filter(o => o.id !== selectedIdRef.current));
          selectedIdRef.current = null;
          movingOpRef.current   = null;
          notifySelection(null);
          redraw();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [active, onOpsChange, tool, redraw, notifySelection]);

    const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    /* ── Pointer handlers ─────────────────────────────────────────────── */

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!active) return;
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      const { x, y } = getPos(e);

      if (tool === 'move') {
        // Hit-test from top (last drawn = topmost)
        let hit: DrawOp | null = null;
        for (let i = opsRef.current.length - 1; i >= 0; i--) {
          if (hitTest(opsRef.current[i], x, y)) { hit = opsRef.current[i]; break; }
        }
        if (hit) {
          selectedIdRef.current = hit.id;
          movingOpRef.current   = { ...hit } as DrawOp;
          dragOriginRef.current = { x, y };
          notifySelection(hit.id);
        } else {
          selectedIdRef.current = null;
          movingOpRef.current   = null;
          dragOriginRef.current = null;
          notifySelection(null);
        }
        isDrawing.current = !!hit;
        redraw();
        return;
      }

      isDrawing.current = true;
      const id = crypto.randomUUID();
      switch (tool) {
        case 'pen':       currentOp.current = { id, type: 'pen',       pts: [x, y], color, width: strokeWidth }; break;
        case 'highlight': currentOp.current = { id, type: 'highlight', pts: [x, y], color, width: strokeWidth * 8, opacity: 0.35 }; break;
        case 'eraser':    currentOp.current = { id, type: 'eraser',    pts: [x, y], color: '#000', width: strokeWidth * 5 }; break;
        case 'line':      currentOp.current = { id, type: 'line',  x1: x, y1: y, x2: x, y2: y, color, width: strokeWidth }; break;
        case 'arrow':     currentOp.current = { id, type: 'arrow', x1: x, y1: y, x2: x, y2: y, color, width: strokeWidth }; break;
        case 'rect':      currentOp.current = { id, type: 'rect',    x, y, w: 0, h: 0, color, width: strokeWidth }; break;
        case 'ellipse':   currentOp.current = { id, type: 'ellipse', cx: x, cy: y, rx: 0, ry: 0, color, width: strokeWidth }; break;
      }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!active) return;
      e.preventDefault();
      const { x, y } = getPos(e);

      if (tool === 'move') {
        if (isDrawing.current && dragOriginRef.current && movingOpRef.current) {
          const origOp = opsRef.current.find(o => o.id === selectedIdRef.current);
          if (origOp) {
            const dx = x - dragOriginRef.current.x;
            const dy = y - dragOriginRef.current.y;
            movingOpRef.current = moveOp(origOp, dx, dy);
            redraw();
          }
        }
        return;
      }

      if (!isDrawing.current || !currentOp.current) return;
      const op = currentOp.current;
      if (op.type === 'pen' || op.type === 'highlight' || op.type === 'eraser') {
        op.pts.push(x, y);
      } else if (op.type === 'line' || op.type === 'arrow') {
        op.x2 = x; op.y2 = y;
      } else if (op.type === 'rect') {
        op.w = x - op.x; op.h = y - op.y;
      } else if (op.type === 'ellipse') {
        op.rx = Math.abs(x - op.cx); op.ry = Math.abs(y - op.cy);
      }
      redraw();
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!active) return;

      if (tool === 'move') {
        if (isDrawing.current && movingOpRef.current) {
          const movedOp = movingOpRef.current;
          const newOps  = opsRef.current.map(o => o.id === movedOp.id ? movedOp : o);
          movingOpRef.current = null;
          onOpsChange(newOps);
          // Update bounds after move (use updated ops)
          const PAD = 6;
          const b = getBounds(movedOp);
          onSelectionChangeRef.current?.(movedOp.id, { x: b.x - PAD, y: b.y - PAD, w: b.w + PAD * 2, h: b.h + PAD * 2 });
        }
        isDrawing.current = false;
        return;
      }

      if (!isDrawing.current) return;
      isDrawing.current = false;
      const op = currentOp.current;
      if (op) {
        const valid =
          (op.type === 'pen' || op.type === 'highlight' || op.type === 'eraser') ? op.pts.length >= 4 :
          (op.type === 'line' || op.type === 'arrow') ? (Math.abs(op.x2 - op.x1) + Math.abs(op.y2 - op.y1)) > 3 :
          (op.type === 'rect') ? (Math.abs(op.w) + Math.abs(op.h)) > 4 :
          (op.type === 'ellipse') ? (op.rx + op.ry) > 4 : true;
        if (valid) onOpsChange([...opsRef.current, { ...op }]);
        currentOp.current = null;
        redraw();
      }
    };

    /* ── Cursor ───────────────────────────────────────────────────────── */
    let cursor: string;
    if (tool === 'eraser') cursor = 'cell';
    else if (tool === 'move') cursor = isDrawing.current ? 'grabbing' : 'default';
    else cursor = 'crosshair';

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: active ? 50 : -1,
          pointerEvents: active ? 'all' : 'none',
          cursor,
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    );
  }
);

/* ─── Renderer ─────────────────────────────────────────────────────────── */

function renderOp(ctx: CanvasRenderingContext2D, op: DrawOp) {
  ctx.save();
  ctx.lineCap   = 'round';
  ctx.lineJoin  = 'round';
  ctx.globalAlpha = op.opacity ?? 1;

  if (op.type === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth   = op.width;
    if (op.pts.length >= 4) {
      ctx.beginPath();
      ctx.moveTo(op.pts[0], op.pts[1]);
      for (let i = 2; i < op.pts.length; i += 2) ctx.lineTo(op.pts[i], op.pts[i + 1]);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.strokeStyle = op.color;
  ctx.lineWidth   = op.width;

  switch (op.type) {
    case 'pen':
    case 'highlight': {
      if (op.pts.length < 4) break;
      ctx.beginPath();
      ctx.moveTo(op.pts[0], op.pts[1]);
      for (let i = 2; i < op.pts.length; i += 2) ctx.lineTo(op.pts[i], op.pts[i + 1]);
      ctx.stroke();
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
      break;
    }
    case 'rect': {
      if (op.fill) { ctx.fillStyle = op.fill; ctx.fillRect(op.x, op.y, op.w, op.h); }
      ctx.strokeRect(op.x, op.y, op.w, op.h);
      break;
    }
    case 'ellipse': {
      if (op.rx < 1 || op.ry < 1) break;
      ctx.beginPath();
      ctx.ellipse(op.cx, op.cy, op.rx, op.ry, 0, 0, Math.PI * 2);
      if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
      ctx.stroke();
      break;
    }
    case 'arrow': {
      const dx = op.x2 - op.x1, dy = op.y2 - op.y1;
      const len = Math.hypot(dx, dy);
      if (len < 3) break;
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
      const ang = Math.atan2(dy, dx);
      const ah  = Math.min(22, len * 0.38) + op.width * 1.5;
      const sp  = Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(op.x2, op.y2);
      ctx.lineTo(op.x2 - ah * Math.cos(ang - sp), op.y2 - ah * Math.sin(ang - sp));
      ctx.lineTo(op.x2 - ah * Math.cos(ang + sp), op.y2 - ah * Math.sin(ang + sp));
      ctx.closePath();
      ctx.fillStyle = op.color;
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}
