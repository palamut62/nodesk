import { useRef, useState, useEffect, useCallback } from 'react';
import { Pencil, Minus, Square, Circle, ArrowRight, Eraser, Highlighter, Undo2, Trash2, X, GripVertical, ImageDown, Move } from 'lucide-react';
import type { DrawTool, Language } from '@/lib/types';
import { makeT } from '@/lib/i18n';

interface Props {
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  language: Language;
  hasSelection: boolean;
  onToolChange: (t: DrawTool) => void;
  onColorChange: (c: string) => void;
  onWidthChange: (w: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
  onExit: () => void;
  onSavePng: () => void;
}

const DRAW_COLORS = [
  '#e11d48', '#f97316', '#eab308', '#16a34a',
  '#2563eb', '#7c3aed', '#000000', '#6b7280',
  '#ffffff', '#f9a8d4', '#bbf7d0', '#bfdbfe',
];

export function DrawingToolbar({
  tool, color, strokeWidth, language, hasSelection,
  onToolChange, onColorChange, onWidthChange,
  onUndo, onClear, onDeleteSelected, onExit, onSavePng,
}: Props) {
  const t = makeT(language);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const w = panel?.offsetWidth ?? 172;
    const h = panel?.offsetHeight ?? 420;
    setPos({
      x: window.innerWidth - w - 18,
      y: Math.max(20, (window.innerHeight - h) / 2),
    });
  }, []);

  const onDragMove = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos({ x: dragState.current.origX + dx, y: dragState.current.origY + dy });
  }, []);

  const onDragEnd = useCallback(() => {
    dragState.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
  }, [onDragMove]);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    if (!pos) return;
    e.preventDefault();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  }, [pos, onDragMove, onDragEnd]);

  const tools: { id: DrawTool; icon: React.ReactNode; key: Parameters<typeof t>[0] }[] = [
    { id: 'move',      icon: <Move        size={13} />, key: 'draw.move'      },
    { id: 'pen',       icon: <Pencil      size={13} />, key: 'draw.pen'       },
    { id: 'highlight', icon: <Highlighter size={13} />, key: 'draw.highlight' },
    { id: 'line',      icon: <Minus       size={13} />, key: 'draw.line'      },
    { id: 'arrow',     icon: <ArrowRight  size={13} />, key: 'draw.arrow'     },
    { id: 'rect',      icon: <Square      size={13} />, key: 'draw.rect'      },
    { id: 'ellipse',   icon: <Circle      size={13} />, key: 'draw.ellipse'   },
    { id: 'eraser',    icon: <Eraser      size={13} />, key: 'draw.eraser'    },
  ];

  const widths: { value: number; key: Parameters<typeof t>[0] }[] = [
    { value: 1.5, key: 'draw.thin'   },
    { value: 3,   key: 'draw.medium' },
    { value: 6,   key: 'draw.thick'  },
  ];

  const style: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', transform: 'none' }
    : {};

  return (
    <div className="drawing-toolbar" ref={panelRef} style={style}>
      <div className="drawing-tb-header" onPointerDown={onDragStart} style={{ cursor: 'grab' }}>
        <GripVertical size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <span className="drawing-tb-title">✏️ {t('draw.mode')}</span>
        <button
          className="drawing-tb-exit"
          onPointerDown={e => e.stopPropagation()}
          onClick={onExit}
          title={t('draw.exit')}
        >
          <X size={12} />
        </button>
      </div>

      <div className="drawing-tb-section">
        <div className="drawing-tb-label">{t('draw.tool')}</div>
        <div className="drawing-tools-grid">
          {tools.map(item => (
            <button
              key={item.id}
              className={`drawing-tool-btn${tool === item.id ? ' drawing-tool-active' : ''}`}
              onClick={() => onToolChange(item.id)}
              title={t(item.key)}
            >
              {item.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="drawing-tb-section">
        <div className="drawing-tb-label">{t('draw.color')}</div>
        <div className="drawing-colors-grid">
          {DRAW_COLORS.map(c => (
            <button
              key={c}
              className={`drawing-color-btn${color === c ? ' drawing-color-active' : ''}`}
              style={{ background: c, border: c === '#ffffff' ? '1px solid #ccc' : undefined }}
              onClick={() => onColorChange(c)}
            />
          ))}
        </div>
        <input
          type="color"
          value={color}
          onChange={e => onColorChange(e.target.value)}
          className="drawing-color-picker"
        />
      </div>

      <div className="drawing-tb-section">
        <div className="drawing-tb-label">{t('draw.width')}</div>
        <div className="drawing-widths">
          {widths.map(w => (
            <button
              key={w.value}
              className={`drawing-width-btn${strokeWidth === w.value ? ' drawing-width-active' : ''}`}
              onClick={() => onWidthChange(w.value)}
              title={t(w.key)}
            >
              <span style={{
                display: 'block',
                height: Math.max(1.5, w.value * 1.2),
                background: color,
                borderRadius: 99,
                width: '100%',
              }} />
            </button>
          ))}
        </div>
      </div>

      <div className="drawing-tb-actions">
        <button className="drawing-action-btn" onClick={onUndo}>
          <Undo2 size={12} />
          {t('draw.undo')}
        </button>
        {hasSelection && (
          <button className="drawing-action-btn drawing-action-danger" onClick={onDeleteSelected}>
            <Trash2 size={12} />
            {t('draw.delete')}
          </button>
        )}
        <button className="drawing-action-btn" onClick={onSavePng}>
          <ImageDown size={12} />
          {t('draw.savepng')}
        </button>
        <button className="drawing-action-btn drawing-action-danger" onClick={onClear}>
          <Trash2 size={12} />
          {t('draw.clear')}
        </button>
      </div>
    </div>
  );
}
