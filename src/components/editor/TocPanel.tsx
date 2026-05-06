import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { X, List } from 'lucide-react';

interface TocItem {
  level: number;
  text: string;
  pos: number;
}

interface Props {
  editor: Editor | null;
  onClose: () => void;
}

export function TocPanel({ editor, onClose }: Props) {
  const [items, setItems] = useState<TocItem[]>([]);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const headings: TocItem[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          headings.push({ level: node.attrs.level as number, text: node.textContent, pos });
        }
      });
      setItems(headings);
    };
    update();
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor]);

  const handleClick = (pos: number) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos + 1).run();
    const domNode = editor.view.nodeDOM(pos);
    if (domNode instanceof HTMLElement) {
      domNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="toc-panel">
      <div className="toc-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <List size={13} style={{ opacity: 0.6 }} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>İçindekiler</span>
        </div>
        <button className="toc-close-btn" onClick={onClose} type="button" title="Kapat">
          <X size={12} />
        </button>
      </div>
      <div className="toc-panel-body">
        {items.length === 0 ? (
          <div className="toc-empty">H1/H2/H3 başlık eklediğinizde burada görünür.</div>
        ) : (
          <div className="toc-items">
            {items.map((item, i) => (
              <button
                key={`${item.pos}-${i}`}
                className={`toc-item toc-h${item.level}`}
                onClick={() => handleClick(item.pos)}
                title={item.text}
                type="button"
              >
                {item.text || '(boş başlık)'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
