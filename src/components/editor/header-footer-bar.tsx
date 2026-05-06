import { useState, useRef, useEffect } from 'react';
import { HFZone, HeaderFooter } from '@/lib/types';
import {
  Type, Hash, Calendar, FileText, X, Upload, ChevronUp, ChevronDown,
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';

interface Props {
  data: HeaderFooter;
  type: 'header' | 'footer';
  noteTitle: string;
  pageNumber?: number;
  marginLeft: number;
  marginRight: number;
  height: number;
  onChange: (updates: Partial<HeaderFooter>) => void;
  topOverride?: number;
}

const TOKENS = [
  { label: '{sayfa}', title: 'Page number', icon: Hash },
  { label: '{tarih}', title: "Today's date", icon: Calendar },
  { label: '{başlık}', title: 'Note title', icon: FileText },
];

const ALIGN_OPTS: { value: 'left' | 'center' | 'right'; icon: typeof AlignLeft; label: string }[] = [
  { value: 'left',   icon: AlignLeft,   label: 'Align left' },
  { value: 'center', icon: AlignCenter, label: 'Center' },
  { value: 'right',  icon: AlignRight,  label: 'Align right' },
];

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

function defaultAlign(zone: 'left' | 'center' | 'right'): 'left' | 'center' | 'right' {
  return zone;
}

function ZoneContent({
  zone, zonePos, noteTitle, pageNumber,
}: {
  zone: HFZone;
  zonePos: 'left' | 'center' | 'right';
  noteTitle: string;
  pageNumber: number;
}) {
  const imgH = zone.imageHeight ?? 28;
  const hasImage = !!zone.image;
  const hasText = !!zone.text?.trim();
  const align = zone.align ?? defaultAlign(zonePos);

  if (!hasImage && !hasText) return null;

  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

  return (
    <div
      className="hf-zone-content"
      style={{ justifyContent: justifyMap[align], textAlign: align, width: '100%' }}
    >
      {hasImage && (
        <img
          src={zone.image}
          alt="logo"
          className="hf-logo-img"
          style={{ height: imgH }}
          draggable={false}
        />
      )}
      {hasText && (
        <span className="hf-text">
          {resolveTokens(zone.text, noteTitle, pageNumber)}
        </span>
      )}
    </div>
  );
}

interface ZoneEditorProps {
  zone: 'left' | 'center' | 'right';
  data: HFZone;
  type: 'header' | 'footer';
  onClose: () => void;
  onChange: (updates: Partial<HFZone>) => void;
}

function ZoneEditor({ zone, data, type, onClose, onChange }: ZoneEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const zoneLabel = zone === 'left' ? 'Left' : zone === 'center' ? 'Center' : 'Right';
  const typeLabel = type === 'header' ? 'Header' : 'Footer';
  const currentAlign = data.align ?? defaultAlign(zone);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.closest('.hf-bar')?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange({ image: reader.result, imageHeight: data.imageHeight ?? 28 });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const insertToken = (token: string) => {
    onChange({ text: (data.text || '') + token });
  };

  return (
    <div
      ref={panelRef}
      className={`hf-editor-panel hf-panel-pos-${type}`}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="hf-editor-titlebar">
        <span className="hf-editor-title">
          <Type size={11} />
          {typeLabel} — {zoneLabel} Zone
        </span>
        <button className="hf-editor-close" onClick={onClose} title="Close">
          <X size={12} />
        </button>
      </div>

      <div className="hf-editor-body">
        {/* Alignment */}
        <div className="hf-editor-section">
          <label className="hf-editor-label">Alignment</label>
          <div className="hf-align-row">
            {ALIGN_OPTS.map(opt => (
              <button
                key={opt.value}
                className={`hf-align-btn ${currentAlign === opt.value ? 'hf-align-btn-active' : ''}`}
                title={opt.label}
                onMouseDown={e => { e.preventDefault(); onChange({ align: opt.value }); }}
              >
                <opt.icon size={13} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Text input */}
        <div className="hf-editor-section">
          <label className="hf-editor-label">Text</label>
          <input
            autoFocus
            className="hf-input"
            value={data.text || ''}
            onChange={e => onChange({ text: e.target.value })}
            placeholder="Enter text or insert a token…"
          />
          <div className="hf-token-row">
            {TOKENS.map(t => (
              <button
                key={t.label}
                className="hf-token-chip"
                title={t.title}
                onMouseDown={e => { e.preventDefault(); insertToken(t.label); }}
              >
                <t.icon size={9} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Image / Logo */}
        <div className="hf-editor-section">
          <label className="hf-editor-label">Logo / Image</label>
          {data.image ? (
            <div className="hf-logo-preview-row">
              <img
                src={data.image}
                alt="logo"
                className="hf-logo-preview"
                style={{ height: data.imageHeight ?? 28 }}
              />
              <div className="hf-logo-size-controls">
                <span className="hf-editor-label" style={{ marginBottom: 0 }}>
                  Height: {data.imageHeight ?? 28}px
                </span>
                <div className="hf-size-btns">
                  <button
                    className="hf-size-btn"
                    onMouseDown={e => { e.preventDefault(); onChange({ imageHeight: Math.min(80, (data.imageHeight ?? 28) + 4) }); }}
                    title="Increase"
                  ><ChevronUp size={10} /></button>
                  <button
                    className="hf-size-btn"
                    onMouseDown={e => { e.preventDefault(); onChange({ imageHeight: Math.max(12, (data.imageHeight ?? 28) - 4) }); }}
                    title="Decrease"
                  ><ChevronDown size={10} /></button>
                </div>
              </div>
              <button
                className="hf-logo-remove-btn"
                onMouseDown={e => { e.preventDefault(); onChange({ image: undefined }); }}
                title="Remove image"
              >
                <X size={11} /> Remove
              </button>
            </div>
          ) : (
            <button
              className="hf-upload-btn"
              onMouseDown={e => { e.preventDefault(); imageInputRef.current?.click(); }}
            >
              <Upload size={11} />
              Upload Logo / Image
            </button>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>
      </div>
    </div>
  );
}

export function HeaderFooterBar({
  data, type, noteTitle, pageNumber = 1, marginLeft, marginRight, height, onChange, topOverride,
}: Props) {
  const [activeZone, setActiveZone] = useState<'left' | 'center' | 'right' | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  if (!data.visible) return null;

  const left   = normalizeZone(data.left);
  const center = normalizeZone(data.center);
  const right  = normalizeZone(data.right);
  const zoneData = { left, center, right };

  const handleZoneChange = (zone: 'left' | 'center' | 'right', updates: Partial<HFZone>) => {
    onChange({ [zone]: { ...zoneData[zone], ...updates } } as Partial<HeaderFooter>);
  };

  const zoneHasContent = (z: HFZone) => !!(z.text?.trim() || z.image);

  const zones: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];

  return (
    <div
      ref={barRef}
      className={`hf-bar hf-bar-${type} ${activeZone ? 'hf-bar-editing' : ''}`}
      style={{
        height, paddingLeft: marginLeft, paddingRight: marginRight,
        ...(topOverride !== undefined ? { top: topOverride, bottom: 'auto' } : {}),
      }}
    >
      {zones.map(zone => (
        <div
          key={zone}
          className={`hf-zone hf-zone-${zone} ${activeZone === zone ? 'hf-zone-active' : ''}`}
          onClick={e => { e.stopPropagation(); setActiveZone(activeZone === zone ? null : zone); }}
          title={`Edit ${zone} zone`}
        >
          {zoneHasContent(zoneData[zone])
            ? (
              <ZoneContent
                zone={zoneData[zone]}
                zonePos={zone}
                noteTitle={noteTitle}
                pageNumber={pageNumber}
              />
            )
            : <span className="hf-empty-hint">{zone === 'left' ? 'Left' : zone === 'center' ? 'Center' : 'Right'}</span>
          }
        </div>
      ))}

      {activeZone && (
        <ZoneEditor
          zone={activeZone}
          data={zoneData[activeZone]}
          type={type}
          onClose={() => setActiveZone(null)}
          onChange={u => handleZoneChange(activeZone, u)}
        />
      )}
    </div>
  );
}

export function HeaderFooterToggle({
  data,
  type,
  onChange,
}: {
  data: HeaderFooter;
  type: 'header' | 'footer';
  onChange: (updates: Partial<HeaderFooter>) => void;
}) {
  return (
    <button
      className={`hf-toggle-btn ${data.visible ? 'hf-toggle-active' : ''}`}
      onClick={() => onChange({ visible: !data.visible })}
      title={`${type === 'header' ? 'Header' : 'Footer'} ${data.visible ? 'hide' : 'show'}`}
    >
      {type === 'header' ? 'Header' : 'Footer'}
    </button>
  );
}
