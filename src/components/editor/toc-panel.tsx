import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { X, List } from 'lucide-react';

interface TocItem {
  level: number;
  text: string;
  pos: number;
  id: string;
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
          headings.push({
            level: node.attrs.level as number,
            text: node.textContent,
            pos,
            id: `${pos}`,
          });
        }
      });
      setItems(headings);
    };

    update();
    editor.on('update', update);
    return () => {
      editor.off('update', update);
    };
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
        <div className="flex items-center gap-1.5">
          <List className="h-3.5 w-3.5 opacity-60" />
          <span className="text-xs font-semibold">İçindekiler</span>
        </div>
        <button
          className="toc-close-btn"
          onClick={onClose}
          title="Kapat"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="toc-panel-body">
        {items.length === 0 ? (
          <div className="toc-empty">Başlık bulunamadı. Editörde H1/H2/H3 başlıkları ekleyin.</div>
        ) : (
          <div className="toc-items">
            {items.map((item) => (
              <button
                key={item.id}
                className={`toc-item toc-h${item.level}`}
                onClick={() => handleClick(item.pos)}
                title={item.text}
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
