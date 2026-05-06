import { useEffect, useCallback } from 'react';
import { X, Printer } from 'lucide-react';
import { Note, Settings, HFZone, HeaderFooter } from '@/lib/types';

interface Props {
  note: Note;
  settings: Settings;
  onClose: () => void;
}

function resolveTokens(text: string, title: string, page: number): string {
  const today = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  return text
    .replace(/\{sayfa\}/g, String(page))
    .replace(/\{tarih\}/g, today)
    .replace(/\{başlık\}/g, title);
}

function normalizeZone(z: unknown): HFZone {
  if (!z) return { text: '' };
  if (typeof z === 'string') return { text: z };
  return z as HFZone;
}

function migrateHF(hf: unknown, defaultCenter = ''): HeaderFooter {
  const h = hf as Record<string, unknown> | undefined | null;
  if (!h) return { left: { text: '' }, center: { text: defaultCenter }, right: { text: '' }, visible: false };
  return {
    left: normalizeZone(h.left),
    center: normalizeZone(h.center),
    right: normalizeZone(h.right),
    visible: !!(h.visible),
  };
}

function HFRow({
  data, noteTitle, pageNumber, height, marginLeft, marginRight,
}: {
  data: HeaderFooter;
  noteTitle: string;
  pageNumber: number;
  height: number;
  marginLeft: number;
  marginRight: number;
}) {
  if (!data.visible) return null;

  const renderZone = (zone: HFZone, zonePos: 'left' | 'center' | 'right') => {
    const imgH = zone.imageHeight ?? 24;
    const hasImage = !!zone.image;
    const hasText = !!zone.text?.trim();
    const align = zone.align ?? zonePos;
    if (!hasImage && !hasText) return null;
    const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: justifyMap[align], gap: 4 }}>
        {hasImage && (
          <img src={zone.image} alt="" style={{ height: imgH, objectFit: 'contain' }} />
        )}
        {hasText && (
          <span style={{ fontSize: 10, color: '#666', whiteSpace: 'pre' }}>
            {resolveTokens(zone.text, noteTitle, pageNumber)}
          </span>
        )}
      </div>
    );
  };

  const left   = normalizeZone(data.left);
  const center = normalizeZone(data.center);
  const right  = normalizeZone(data.right);

  return (
    <div
      style={{
        position: 'absolute', left: 0, right: 0,
        height,
        paddingLeft: marginLeft,
        paddingRight: marginRight,
        display: 'flex',
        alignItems: 'center',
        borderBottom: data === data ? undefined : '1px solid #e5e7eb',
      }}
    >
      <div style={{ flex: 1 }}>{renderZone(left, 'left')}</div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>{renderZone(center, 'center')}</div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{renderZone(right, 'right')}</div>
    </div>
  );
}

export function PrintPreview({ note, settings, onClose }: Props) {
  const mTop    = settings.marginTop    ?? 80;
  const mBottom = settings.marginBottom ?? 120;
  const mLeft   = settings.marginLeft   ?? 80;
  const mRight  = settings.marginRight  ?? 80;
  const pattern = settings.backgroundPattern ?? 'none';
  const hasPattern = pattern !== 'none';

  const safeHeader = migrateHF(note.header);
  const safeFooter = migrateHF(note.footer, '{sayfa}');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('pp-mode');
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
      document.body.classList.remove('pp-mode');
    };
  }, [onClose]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="pp-overlay">
      {/* Controls bar */}
      <div className="pp-controls">
        <span className="pp-controls-title">
          Baskı Önizleme
          {note.title ? ` — ${note.title}` : ''}
        </span>
        <div className="pp-controls-actions">
          <button className="pp-btn pp-btn-primary" onClick={handlePrint}>
            <Printer size={14} />
            Yazdır / PDF Kaydet
          </button>
          <button className="pp-btn" onClick={onClose} title="Kapat (Esc)">
            <X size={14} />
            Kapat
          </button>
        </div>
      </div>

      {/* Scroll area */}
      <div className="pp-scroll">
        <div id="pp-page" className="pp-page">
          {/* Background pattern + border */}
          {hasPattern && (
            <>
              <div
                className={pattern === 'lines' ? 'pp-pattern-lines' : 'pp-pattern-grid'}
                style={{
                  position: 'absolute', top: mTop, left: mLeft, right: mRight, bottom: mBottom,
                  pointerEvents: 'none', zIndex: 0,
                }}
              />
              {pattern === 'grid' && (
                <div style={{
                  position: 'absolute', top: mTop, left: mLeft, right: mRight, bottom: mBottom,
                  border: '1px solid rgba(0,0,0,0.14)',
                  pointerEvents: 'none', zIndex: 1, boxSizing: 'border-box',
                }} />
              )}
            </>
          )}
          {/* Header */}
          {safeHeader.visible && (
            <div
              className="pp-hf pp-header"
              style={{ height: mTop, paddingLeft: mLeft, paddingRight: mRight }}
            >
              <HFRow
                data={safeHeader}
                noteTitle={note.title || ''}
                pageNumber={1}
                height={mTop}
                marginLeft={mLeft}
                marginRight={mRight}
              />
            </div>
          )}

          {/* Note content */}
          <div
            className="tiptap pp-content"
            style={{
              paddingTop:    mTop,
              paddingBottom: mBottom,
              paddingLeft:   mLeft,
              paddingRight:  mRight,
            }}
          >
            {/* Wrap-floated textboxes must come FIRST so text flows around them */}
            {note.textboxes.filter(tb => tb.wrapText).map(tb => {
              const floatDir = tb.float ?? 'left';
              return (
                <div
                  key={tb.id}
                  style={{
                    float: floatDir,
                    width: tb.width,
                    height: tb.height,
                    marginTop: Math.max(0, tb.y - mTop),
                    marginLeft: floatDir === 'right' ? 14 : 0,
                    marginRight: floatDir === 'left' ? 14 : 0,
                    marginBottom: 10,
                    border: tb.borderStyle !== 'none' ? `2px ${tb.borderStyle ?? 'solid'} ${tb.borderColor ?? '#ccc'}` : undefined,
                    backgroundColor: tb.backgroundColor ?? '#fffde7',
                    color: tb.textColor ?? '#222',
                    fontSize: tb.fontSize ?? 14,
                    padding: 8,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                  dangerouslySetInnerHTML={{ __html: tb.content }}
                />
              );
            })}
            <div dangerouslySetInnerHTML={{ __html: note.content }} />
          </div>

          {/* Footer */}
          {safeFooter.visible && (
            <div
              className="pp-hf pp-footer"
              style={{ height: mBottom, paddingLeft: mLeft, paddingRight: mRight }}
            >
              <HFRow
                data={safeFooter}
                noteTitle={note.title || ''}
                pageNumber={1}
                height={mBottom}
                marginLeft={mLeft}
                marginRight={mRight}
              />
            </div>
          )}

          {/* Absolute textboxes (non-wrap only) */}
          {note.textboxes.filter(tb => !tb.wrapText).map(tb => (
            <div
              key={tb.id}
              style={{
                position: 'absolute',
                left: tb.x, top: tb.y,
                width: tb.width, height: tb.height,
                border: tb.borderStyle !== 'none' ? `2px ${tb.borderStyle ?? 'solid'} ${tb.borderColor ?? '#ccc'}` : undefined,
                backgroundColor: tb.backgroundColor ?? '#fffde7',
                color: tb.textColor ?? '#222',
                fontSize: tb.fontSize ?? 14,
                padding: 8,
                boxSizing: 'border-box',
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
              dangerouslySetInnerHTML={{ __html: tb.content }}
            />
          ))}

          {/* Floating images */}
          {(note.images ?? []).map(img => (
            <img
              key={img.id}
              src={img.src}
              alt={img.alt}
              style={{
                position: 'absolute',
                left: img.x, top: img.y,
                width: img.width, height: img.height,
                objectFit: 'contain',
                pointerEvents: 'none',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
