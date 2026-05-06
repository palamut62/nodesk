import { useState, useEffect, useRef } from 'react';
import { Clipboard, ChevronDown, X } from 'lucide-react';
import { useApp } from '@/lib/app-state';

const MAX_ITEMS = 15;

export function useClipboardHistory() {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length > 0) {
        setHistory(prev => {
          const filtered = prev.filter(s => s !== sel);
          return [sel, ...filtered].slice(0, MAX_ITEMS);
        });
      }
    };
    document.addEventListener('copy', handler);
    return () => document.removeEventListener('copy', handler);
  }, []);

  return history;
}

interface Props {
  history: string[];
}

export function ClipboardHistoryBtn({ history }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { activeNoteId } = useApp();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pasteText = async (text: string) => {
    try {
      const el = document.activeElement as HTMLElement | null;
      if (el && 'focus' in el) el.focus();
      document.execCommand('insertText', false, text);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    setOpen(false);
  };

  if (!activeNoteId) return null;

  return (
    <div className="clipboard-btn-wrap" ref={panelRef}>
      <button
        className="clipboard-btn"
        onClick={() => setOpen(v => !v)}
        title="Pano geçmişi"
      >
        <Clipboard size={13} />
        <ChevronDown size={10} />
        {history.length > 0 && <span className="clipboard-badge">{history.length}</span>}
      </button>
      {open && (
        <div className="clipboard-panel">
          <div className="clipboard-panel-header">
            <span>Pano Geçmişi</span>
            <button onClick={() => setOpen(false)}><X size={12} /></button>
          </div>
          {history.length === 0 ? (
            <div className="clipboard-empty">Henüz kopyalanan metin yok</div>
          ) : (
            <div className="clipboard-list">
              {history.map((item, i) => (
                <button
                  key={i}
                  className="clipboard-item"
                  onClick={() => pasteText(item)}
                  title="Yapıştırmak için tıkla"
                >
                  <span className="clipboard-item-text">{item.length > 80 ? item.slice(0, 80) + '…' : item}</span>
                  <span className="clipboard-item-len">{item.length}k</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
