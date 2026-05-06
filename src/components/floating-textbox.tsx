import { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { FontFamily } from '@tiptap/extension-font-family';
import { FontSize } from '@tiptap/extension-font-size';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Rnd } from 'react-rnd';
import { TextBox } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Settings2, AlignLeft, AlignRight, WrapText, GripHorizontal } from 'lucide-react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

interface Props {
  textbox: TextBox;
  onChange: (id: string, updates: Partial<TextBox>) => void;
  onDelete: (id: string) => void;
  isActive: boolean;
  onFocus: () => void;
  onEditorReady: (editor: Editor | null) => void;
  floatMarginTop?: number;
}

export function FloatingTextbox({ textbox, onChange, onDelete, isActive, onFocus, onEditorReady, floatMarginTop = 0 }: Props) {
  const onEditorReadyRef = useRef(onEditorReady);
  useEffect(() => { onEditorReadyRef.current = onEditorReady; }, [onEditorReady]);

  const wrapContainerRef = useRef<HTMLDivElement>(null);

  const extensions = useMemo(() => [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    FontFamily,
    FontSize,
    Subscript,
    Superscript,
  ], []);

  const editor = useEditor({
    extensions,
    content: textbox.content || '',
    onUpdate: ({ editor }) => {
      onChange(textbox.id, { content: editor.getHTML() });
    },
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none p-2 min-h-full overflow-y-auto',
      },
    },
  });

  useEffect(() => {
    if (isActive && editor) {
      onEditorReadyRef.current(editor);
    }
  }, [isActive, editor]);

  useEffect(() => {
    return () => { onEditorReadyRef.current(null); };
  }, []);

  // In wrap mode: save size when user manually resizes with CSS resize handle
  useEffect(() => {
    if (!textbox.wrapText) return;
    const el = wrapContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (Math.abs(w - textbox.width) > 2 || Math.abs(h - textbox.height) > 2) {
        onChange(textbox.id, { width: w, height: h });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textbox.wrapText, textbox.id]);

  const settingsPopover = (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 mr-1 text-black/50 hover:text-black"
          onPointerDown={e => e.stopPropagation()}
          title="Ayarlar"
        >
          <Settings2 className="h-3 w-3" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-[9999] w-64 bg-popover text-popover-foreground border p-3 rounded-md shadow-md outline-none animate-in fade-in-0 zoom-in-95"
          style={{ zIndex: 9999 }}
          onPointerDown={e => e.stopPropagation()}
        >
          <div className="grid gap-3">
            <div className="grid grid-cols-2 items-center gap-2">
              <span className="text-xs font-medium">Border</span>
              <Select value={textbox.borderStyle} onValueChange={(v: TextBox['borderStyle']) => onChange(textbox.id, { borderStyle: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="dashed">Dashed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 items-center gap-2">
              <span className="text-xs font-medium">Border Color</span>
              <input type="color" value={textbox.borderColor} onChange={e => onChange(textbox.id, { borderColor: e.target.value })} className="h-6 w-full cursor-pointer p-0 border-0" disabled={textbox.borderStyle === 'none'} />
            </div>
            <div className="grid grid-cols-2 items-center gap-2">
              <span className="text-xs font-medium">Background</span>
              <input type="color" value={textbox.backgroundColor} onChange={e => onChange(textbox.id, { backgroundColor: e.target.value })} className="h-6 w-full cursor-pointer p-0 border-0" />
            </div>
            <div className="grid grid-cols-2 items-center gap-2">
              <span className="text-xs font-medium">Text Color</span>
              <input type="color" value={textbox.textColor} onChange={e => onChange(textbox.id, { textColor: e.target.value })} className="h-6 w-full cursor-pointer p-0 border-0" />
            </div>
            <div className="grid grid-cols-2 items-center gap-2">
              <span className="text-xs font-medium">Font Size</span>
              <Select value={textbox.fontSize.toString()} onValueChange={v => onChange(textbox.id, { fontSize: parseInt(v, 10) })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 12, 14, 16, 18, 20, 24, 28, 32].map(s => <SelectItem key={s} value={s.toString()}>{s}px</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="border-t pt-2 grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium flex items-center gap-1">
                  <WrapText className="h-3 w-3" />
                  Text Wrap
                </span>
                <button
                  className={`w-8 h-4 rounded-full transition-colors relative ${textbox.wrapText ? 'bg-primary' : 'bg-muted'}`}
                  onClick={() => onChange(textbox.id, { wrapText: !textbox.wrapText })}
                  onPointerDown={e => e.stopPropagation()}
                  title={textbox.wrapText ? 'Wrap\'ı kapat (serbest sürüklemeye dön)' : 'Wrap\'ı aç'}
                >
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${textbox.wrapText ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {textbox.wrapText && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Float</span>
                  <div className="flex gap-1">
                    <button
                      className={`p-1 rounded border text-xs flex items-center gap-0.5 ${(textbox.float ?? 'left') === 'left' ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
                      onClick={() => onChange(textbox.id, { float: 'left' })}
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <AlignLeft className="h-3 w-3" />L
                    </button>
                    <button
                      className={`p-1 rounded border text-xs flex items-center gap-0.5 ${textbox.float === 'right' ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
                      onClick={() => onChange(textbox.id, { float: 'right' })}
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <AlignRight className="h-3 w-3" />R
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );

  const deleteBtn = (
    <Button
      variant="ghost"
      size="icon"
      className="h-4 w-4 text-black/50 hover:text-destructive"
      onPointerDown={e => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onDelete(textbox.id); }}
    >
      <X className="h-3 w-3" />
    </Button>
  );

  // Handle bar differs in wrap vs drag mode
  const handleBar = textbox.wrapText ? (
    // Wrap mode: always visible, no cursor-move, shows wrap indicator + unwrap button + settings
    <div
      className="h-6 bg-black/5 hover:bg-black/10 flex items-center px-1 shrink-0 select-none"
      style={{ cursor: 'default' }}
    >
      <button
        className="flex items-center gap-0.5 text-[9px] text-black/50 hover:text-primary mr-auto font-medium px-1 py-0.5 rounded hover:bg-black/10"
        onPointerDown={e => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onChange(textbox.id, { wrapText: false }); }}
        title="Wrap'ı kapat ve serbest sürüklemeye dön"
      >
        <WrapText className="h-3 w-3" />
        Unwrap
      </button>
      {settingsPopover}
      {deleteBtn}
    </div>
  ) : (
    // Free drag mode: hidden until hover, shows drag cursor
    <div className="h-6 drag-handle bg-black/5 hover:bg-black/10 cursor-move flex items-center justify-end px-1 shrink-0 opacity-0 group-hover/tb:opacity-100 transition-opacity">
      <GripHorizontal className="h-3 w-3 text-black/30 mr-auto" />
      {settingsPopover}
      {deleteBtn}
    </div>
  );

  const innerContent = (
    <div
      className={`w-full h-full flex flex-col rounded-md overflow-hidden relative group/tb shadow-md ${isActive ? 'ring-2 ring-primary ring-offset-1' : ''}`}
      style={{
        borderStyle: textbox.borderStyle !== 'none' ? textbox.borderStyle : undefined,
        borderWidth: textbox.borderStyle !== 'none' ? 2 : 0,
        borderColor: textbox.borderColor,
        backgroundColor: textbox.backgroundColor,
      }}
      onClick={onFocus}
    >
      {handleBar}
      <div
        className="flex-1 overflow-auto"
        style={{ color: textbox.textColor, fontSize: `${textbox.fontSize}px` }}
        onPointerDown={e => e.stopPropagation()}
      >
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );

  if (textbox.wrapText) {
    const floatDir = textbox.float ?? 'left';
    return (
      <div
        ref={wrapContainerRef}
        style={{
          float: floatDir,
          width: textbox.width,
          height: textbox.height,
          marginTop: Math.max(0, floatMarginTop),
          marginLeft: floatDir === 'right' ? 14 : 0,
          marginRight: floatDir === 'left' ? 14 : 0,
          marginBottom: 10,
          resize: 'both',
          overflow: 'hidden',
          minWidth: 120,
          minHeight: 80,
        }}
      >
        {innerContent}
      </div>
    );
  }

  return (
    <Rnd
      size={{ width: textbox.width, height: textbox.height }}
      position={{ x: textbox.x, y: textbox.y }}
      onDragStop={(_e, d) => onChange(textbox.id, { x: d.x, y: d.y })}
      onResizeStop={(_e, _dir, ref, _delta, position) => {
        onChange(textbox.id, {
          width: parseInt(ref.style.width, 10),
          height: parseInt(ref.style.height, 10),
          ...position,
        });
      }}
      bounds="parent"
      className="absolute z-20"
      dragHandleClassName="drag-handle"
    >
      {innerContent}
    </Rnd>
  );
}
