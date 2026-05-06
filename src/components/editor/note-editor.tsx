import { useEffect, useState, useCallback, useRef } from 'react';
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
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Note, TextBox, FloatingImage, HeaderFooter, HFZone, DrawTool, PageSize, PageOrientation } from '@/lib/types';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { EditorToolbar } from './toolbar';
import { FloatingTextbox } from '../floating-textbox';
import { FloatingImage as FloatingImageComponent } from '../floating-image';
import { FindReplace } from './find-replace';
import { HeaderFooterBar } from './header-footer-bar';
import { AutoCorrectExtension } from './auto-correct-extension';
import { DrawingCanvas, DrawingCanvasHandle } from '@/components/drawing/drawing-canvas';
import { DrawingToolbar } from '@/components/drawing/drawing-toolbar';
import { WikiLinkExtension } from './wiki-link-extension';
import { IndentExtension } from './indent-extension';
import { LineHeightExtension } from './line-height-extension';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { CalloutExtension } from './callout-extension';
import { MarkdownShortcutsExtension } from './markdown-shortcuts-extension';
import { TocPanel } from './toc-panel';
import { AiChatPanel } from '@/components/ai-chat-panel';
import { VersionHistoryDialog } from '@/components/version-history-dialog';
import { NoteEncryptDialog } from '@/components/note-encrypt-dialog';
import { MathInsertDialog } from '@/components/math-insert-dialog';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

const lowlight = createLowlight(common);

interface Props {
  note: Note;
}

const SEP_H = 21;

const PAGE_DIMS: Record<PageSize, { w: number; h: number }> = {
  a4:     { w: 794,  h: 1123 },
  a5:     { w: 559,  h: 794  },
  letter: { w: 816,  h: 1056 },
  legal:  { w: 816,  h: 1344 },
  a3:     { w: 1123, h: 1587 },
};

function resolvePageDims(size?: PageSize, orientation?: PageOrientation) {
  const base = PAGE_DIMS[size ?? 'a4'];
  return orientation === 'landscape'
    ? { w: base.h, h: base.w }
    : base;
}

function resolveHFTokens(text: string, title: string, page: number): string {
  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return text.replace(/\{sayfa\}/g, String(page)).replace(/\{tarih\}/g, today).replace(/\{başlık\}/g, title);
}

function normalizeHFZone(z: unknown): HFZone {
  if (!z) return { text: '' };
  if (typeof z === 'string') return { text: z };
  return z as HFZone;
}

function HFPageOverlay({
  data, noteTitle, pageNumber, marginLeft, marginRight, height, type, pageTop, pageH,
}: {
  data: HeaderFooter; noteTitle: string; pageNumber: number;
  marginLeft: number; marginRight: number; height: number;
  type: 'header' | 'footer'; pageTop: number; pageH: number;
}) {
  if (!data.visible) return null;
  const topPos = type === 'header' ? pageTop : pageTop + pageH - height;
  const zones = (['left', 'center', 'right'] as const).map(pos => {
    const zone = normalizeHFZone(data[pos]);
    const imgH = zone.imageHeight ?? 24;
    const hasImg = !!zone.image;
    const hasText = !!zone.text?.trim();
    if (!hasImg && !hasText) return <div key={pos} style={{ flex: 1 }} />;
    const align = zone.align ?? pos;
    const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;
    return (
      <div key={pos} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: justifyMap[align], gap: 4 }}>
        {hasImg && <img src={zone.image} alt="" style={{ height: imgH, objectFit: 'contain' }} />}
        {hasText && (
          <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', whiteSpace: 'pre' }}>
            {resolveHFTokens(zone.text, noteTitle, pageNumber)}
          </span>
        )}
      </div>
    );
  });
  return (
    <div style={{
      position: 'absolute', top: topPos, left: 0, right: 0, height,
      paddingLeft: marginLeft, paddingRight: marginRight,
      display: 'flex', alignItems: 'center',
      background: 'hsl(var(--card))',
      borderTop: type === 'footer' ? '1px dashed hsl(var(--border) / 0.5)' : undefined,
      borderBottom: type === 'header' ? '1px dashed hsl(var(--border) / 0.5)' : undefined,
      zIndex: 3, boxSizing: 'border-box', pointerEvents: 'none',
    }}>
      {zones}
    </div>
  );
}

function PageOverlays({
  pageRef, header, footer, noteTitle,
  marginLeft, marginRight, marginTop, marginBottom, showBorder, bgClass, pageH,
}: {
  pageRef: React.RefObject<HTMLDivElement | null>;
  header: HeaderFooter; footer: HeaderFooter;
  noteTitle: string;
  marginLeft: number; marginRight: number; marginTop: number; marginBottom: number;
  showBorder: boolean;
  bgClass?: string;
  pageH: number;
}) {
  const [totalH, setTotalH] = useState(pageH);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => { setTotalH(entries[0].contentRect.height); });
    obs.observe(el);
    return () => obs.disconnect();
  }, [pageRef]);

  const count = Math.max(1, Math.ceil(totalH / (pageH + SEP_H)));
  const nodes: React.ReactNode[] = [];

  const t = useT();
  nodes.push(<div key="p1" className="page-first-label">{t('page.first')}</div>);

  if (showBorder) {
    nodes.push(
      <div key="border-0" style={{
        position: 'absolute', top: marginTop, left: marginLeft, right: marginRight,
        height: pageH - marginTop - marginBottom,
        border: '1px solid var(--pattern-line)', pointerEvents: 'none', zIndex: 1, boxSizing: 'border-box',
      }} />
    );
  }

  for (let i = 1; i < count; i++) {
    const labelTop = pageH * i + SEP_H * (i - 1);
    const pageTop  = (pageH + SEP_H) * i;
    nodes.push(
      <div key={`sep-blocker-${i}`} className="page-sep-blocker" style={{ top: labelTop - 1 }} />
    );
    nodes.push(
      <div key={`sep-${i}`} className="page-sep-label" style={{ top: labelTop }}>
        <span className="page-sep-num">{t('page.num', { n: i + 1 })}</span>
      </div>
    );
    nodes.push(
      <HFPageOverlay
        key={`hdr-${i}`}
        data={header} noteTitle={noteTitle} pageNumber={i + 1}
        marginLeft={marginLeft} marginRight={marginRight}
        height={marginTop} type="header" pageTop={pageTop} pageH={pageH}
      />
    );
    nodes.push(
      <HFPageOverlay
        key={`ftr-${i}`}
        data={footer} noteTitle={noteTitle} pageNumber={i + 1}
        marginLeft={marginLeft} marginRight={marginRight}
        height={marginBottom} type="footer" pageTop={pageTop} pageH={pageH}
      />
    );
    if (bgClass) {
      nodes.push(
        <div key={`pat-${i}`}
          className={`page-pattern-overlay ${bgClass}`}
          style={{
            top: pageTop + marginTop,
            height: pageH - marginTop - marginBottom,
            left: marginLeft, right: marginRight,
          }}
        />
      );
    }
    if (showBorder) {
      nodes.push(
        <div key={`border-${i}`} style={{
          position: 'absolute', top: pageTop + marginTop, left: marginLeft, right: marginRight,
          height: pageH - marginTop - marginBottom,
          border: '1px solid var(--pattern-line)', pointerEvents: 'none', zIndex: 1, boxSizing: 'border-box',
        }} />
      );
    }
  }

  return <>{nodes}</>;
}

function SaveIndicator({ updatedAt }: { updatedAt: string }) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const prevRef = useRef(updatedAt);
  useEffect(() => {
    if (updatedAt !== prevRef.current) {
      prevRef.current = updatedAt;
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [updatedAt]);
  return (
    <span className={`save-indicator ${visible ? 'save-indicator-show' : ''}`}>
      {t('status.saved')}
    </span>
  );
}

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

export function NoteEditor({ note }: Props) {
  const { updateNote, settings, notes, setActiveNoteId } = useApp();
  const t = useT();
  const [activeTextboxId, setActiveTextboxId] = useState<string | null>(null);
  const [activeTextboxEditor, setActiveTextboxEditor] = useState<Editor | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [drawMode, setDrawMode] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [drawColor, setDrawColor] = useState('#e11d48');
  const [drawWidth, setDrawWidth] = useState(3);
  const drawCanvasRef = useRef<DrawingCanvasHandle>(null);
  const [selectedDrawId, setSelectedDrawId] = useState<string | null>(null);
  const [selectedDrawBounds, setSelectedDrawBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const pageDims = resolvePageDims(settings.pageSize, settings.pageOrientation);
  const pageH = pageDims.h;
  const pageW = pageDims.w;

  const pageRef = useRef<HTMLDivElement | null>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);
  const [pageMinH, setPageMinH] = useState(pageH);
  const pageMinHRef = useRef(pageH);

  const [showAiChat, setShowAiChat] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showEncrypt, setShowEncrypt] = useState(false);
  const [showMath, setShowMath] = useState(false);

  useEffect(() => {
    const el = editorContentRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const h = el.offsetHeight;
      const pages = Math.max(1, Math.ceil(h / pageH));
      const snapped = pages * pageH + (pages - 1) * SEP_H;
      if (snapped !== pageMinHRef.current) {
        pageMinHRef.current = snapped;
        setPageMinH(snapped);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      AutoCorrectExtension.configure({
        getSettings: () => {
          const s = settingsRef.current;
          return {
            enabled: s.autoCorrect ?? false,
            provider: s.provider,
            apiKey: s.provider === 'openrouter' ? s.openrouterApiKey : s.provider === 'nvidia' ? s.nvidiaApiKey : s.groqApiKey,
            model: s.provider === 'openrouter' ? s.openrouterModel : s.provider === 'nvidia' ? s.nvidiaModel : s.groqModel,
          };
        },
      }),
      WikiLinkExtension.configure({
        getNoteByTitle: (title: string) => {
          const lower = title.toLowerCase();
          return notes.find(n => n.title.toLowerCase() === lower);
        },
        onLinkClick: (noteId: string) => {
          setActiveNoteId(noteId);
        },
      }),
      Subscript,
      Superscript,
      IndentExtension,
      LineHeightExtension,
      CalloutExtension,
      MarkdownShortcutsExtension,
    ],
    content: note.content,
    editorProps: {
      attributes: { class: 'tiptap focus:outline-none min-h-[500px] pb-32' },
    },
    onUpdate: ({ editor }) => {
      updateNote(note.id, { content: editor.getHTML() });
      const text = editor.getText();
      setWordCount(countWords(text));
      setCharCount(text.length);
    },
  });

  useEffect(() => {
    if (editor) {
      const isSameNote = currentNoteIdRef.current === note.id;
      if (!isSameNote) {
        editor.commands.setContent(note.content || '');
        currentNoteIdRef.current = note.id;
        const text = editor.getText();
        setWordCount(countWords(text));
        setCharCount(text.length);
        setTimeout(() => editor.commands.focus(), 10);
      }
    }
  }, [note.id]);

  useEffect(() => {
    if (editor && !currentNoteIdRef.current) {
      currentNoteIdRef.current = note.id;
      const text = editor.getText();
      setWordCount(countWords(text));
      setCharCount(text.length);
    }
  }, [editor]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(v => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleAddTextbox = () => {
    const newTb: TextBox = {
      id: crypto.randomUUID(),
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      content: '',
      borderStyle: 'solid',
      borderColor: '#cccccc',
      backgroundColor: '#fffde7',
      textColor: '#222222',
      fontSize: 14,
    };
    updateNote(note.id, { textboxes: [...note.textboxes, newTb] });
    setActiveTextboxId(newTb.id);
  };

  const handleAddImage = useCallback((src: string, alt: string) => {
    const newImg: FloatingImage = {
      id: crypto.randomUUID(),
      x: 80,
      y: 80,
      width: 320,
      height: 240,
      src,
      alt,
    };
    const currentImages = note.images ?? [];
    updateNote(note.id, { images: [...currentImages, newImg] });
    setActiveImageId(newImg.id);
  }, [note.id, note.images, updateNote]);

  const updateTextbox = (tbId: string, updates: Partial<TextBox>) => {
    const newTextboxes = note.textboxes.map(tb =>
      tb.id === tbId ? { ...tb, ...updates } : tb
    );
    updateNote(note.id, { textboxes: newTextboxes });
  };

  const deleteTextbox = (tbId: string) => {
    updateNote(note.id, { textboxes: note.textboxes.filter(tb => tb.id !== tbId) });
  };

  const updateImage = (imgId: string, updates: Partial<FloatingImage>) => {
    const currentImages = note.images ?? [];
    updateNote(note.id, {
      images: currentImages.map(img => img.id === imgId ? { ...img, ...updates } : img),
    });
  };

  const deleteImage = (imgId: string) => {
    const currentImages = note.images ?? [];
    updateNote(note.id, { images: currentImages.filter(img => img.id !== imgId) });
  };

  const bgClass =
    settings.backgroundPattern === 'lines'
      ? 'bg-pattern-lines'
      : settings.backgroundPattern === 'grid'
      ? 'bg-pattern-grid'
      : '';

  const handlePageClick = () => {
    setActiveTextboxId(null);
    setActiveImageId(null);
    setActiveTextboxEditor(null);
  };

  useEffect(() => {
    if (activeTextboxId === null) setActiveTextboxEditor(null);
  }, [activeTextboxId]);

  function migrateZone(z: unknown): HFZone {
    if (!z) return { text: '' };
    if (typeof z === 'string') return { text: z };
    return z as HFZone;
  }
  function migrateHF(hf: unknown, defaultCenter = ''): HeaderFooter {
    const h = hf as Record<string, unknown> | undefined | null;
    if (!h) return { left: { text: '' }, center: { text: defaultCenter }, right: { text: '' }, visible: false };
    return {
      left: migrateZone(h.left),
      center: migrateZone(h.center),
      right: migrateZone(h.right),
      visible: !!(h.visible),
    };
  }
  const safeHeader: HeaderFooter = migrateHF(note.header);
  const safeFooter: HeaderFooter = migrateHF(note.footer, '{sayfa}');

  if (note.encrypted) {
    return (
      <div className="editor-shell">
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-muted-foreground">
          <Lock className="h-12 w-12 opacity-30" />
          <div className="text-sm font-medium">{t('encrypt.locked')}</div>
          <Button variant="outline" size="sm" onClick={() => setShowEncrypt(true)}>
            {t('encrypt.unlock')}
          </Button>
        </div>
        <NoteEncryptDialog note={note} open={showEncrypt} onClose={() => setShowEncrypt(false)} />
      </div>
    );
  }

  return (
    <div className="editor-shell" style={{ display: 'flex', flexDirection: 'column' }}>
      <EditorToolbar
        editor={activeTextboxEditor ?? editor}
        note={note}
        drawMode={drawMode}
        onToggleDrawMode={() => setDrawMode(v => !v)}
        onAddTextbox={handleAddTextbox}
        onAddImage={handleAddImage}
        onToggleFindReplace={() => setShowFindReplace(v => !v)}
        onOpenMath={() => setShowMath(true)}
        onOpenVersionHistory={() => setShowVersionHistory(true)}
        onOpenEncrypt={() => setShowEncrypt(true)}
        onToggleAiChat={() => setShowAiChat(v => !v)}
        aiChatOpen={showAiChat}
        onToggleToc={() => setShowToc(v => !v)}
        tocOpen={showToc}
      />

      {showFindReplace && (
        <FindReplace editor={editor} onClose={() => setShowFindReplace(false)} />
      )}

      {drawMode && (
        <DrawingToolbar
          tool={drawTool}
          color={drawColor}
          strokeWidth={drawWidth}
          language={settings.language ?? 'tr'}
          hasSelection={!!selectedDrawId}
          onToolChange={t => { setDrawTool(t); if (t !== 'move') { setSelectedDrawId(null); setSelectedDrawBounds(null); } }}
          onColorChange={setDrawColor}
          onWidthChange={setDrawWidth}
          onUndo={() => drawCanvasRef.current?.undo()}
          onClear={() => { drawCanvasRef.current?.clear(); setSelectedDrawId(null); setSelectedDrawBounds(null); }}
          onDeleteSelected={() => { drawCanvasRef.current?.deleteSelected(); setSelectedDrawId(null); setSelectedDrawBounds(null); }}
          onExit={() => { setDrawMode(false); setSelectedDrawId(null); setSelectedDrawBounds(null); }}
          onSavePng={async () => {
            const page = pageRef.current;
            if (!page) return;

            const SCALE = 2;
            const pw = page.offsetWidth;
            const ph = page.offsetHeight;

            const drawEl = drawCanvasRef.current?.getCanvas();
            if (drawEl) drawEl.style.visibility = 'hidden';

            const html2canvas = (await import('html2canvas')).default;
            const pageSnapshot = await html2canvas(page, {
              scale: SCALE,
              useCORS: true,
              backgroundColor: '#ffffff',
              logging: false,
              scrollX: 0,
              scrollY: 0,
            });

            if (drawEl) drawEl.style.visibility = '';

            const final = document.createElement('canvas');
            final.width  = pw * SCALE;
            final.height = ph * SCALE;
            const ctx = final.getContext('2d')!;

            ctx.drawImage(pageSnapshot, 0, 0);

            const tmp = document.createElement('canvas');
            tmp.width  = pw;
            tmp.height = ph;
            drawCanvasRef.current?.renderOpsToCanvas(tmp);
            ctx.drawImage(tmp, 0, 0, pw * SCALE, ph * SCALE);

            const link = document.createElement('a');
            link.download = `${note.title || 'Not'}.png`;
            link.href = final.toDataURL('image/png');
            link.click();
          }}
        />
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div
          className="editor-scroll"
          style={{ flex: 1, overflow: 'auto' }}
          onClick={drawMode ? undefined : handlePageClick}
        >
          <div
            className="editor-page"
            ref={pageRef}
            style={{
              ['--page-w' as string]: `${pageW}px`,
              ['--page-h' as string]: `${pageH}px`,
              minHeight: pageMinH,
              ...(settings.pageColor ? { background: settings.pageColor } : {}),
            }}
          >
            <DrawingCanvas
              ref={drawCanvasRef}
              ops={note.drawOps ?? []}
              onOpsChange={ops => updateNote(note.id, { drawOps: ops })}
              tool={drawTool}
              color={drawColor}
              strokeWidth={drawWidth}
              active={drawMode}
              onSelectionChange={(id, bounds) => {
                setSelectedDrawId(id);
                setSelectedDrawBounds(bounds);
              }}
            />
            {drawMode && selectedDrawId && selectedDrawBounds && (
              <button
                title="Sil"
                style={{
                  position: 'absolute',
                  left: selectedDrawBounds.x + selectedDrawBounds.w,
                  top: selectedDrawBounds.y,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 55,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: '#fff',
                  border: '2px solid #fff',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 12,
                  lineHeight: 1,
                }}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  drawCanvasRef.current?.deleteSelected();
                  setSelectedDrawId(null);
                  setSelectedDrawBounds(null);
                }}
              >
                ×
              </button>
            )}
            <PageOverlays
              pageRef={pageRef}
              header={safeHeader}
              footer={safeFooter}
              noteTitle={note.title}
              marginLeft={settings.marginLeft ?? 80}
              marginRight={settings.marginRight ?? 80}
              marginTop={settings.marginTop ?? 80}
              marginBottom={settings.marginBottom ?? 120}
              showBorder={settings.backgroundPattern === 'grid'}
              bgClass={bgClass || undefined}
              pageH={pageH}
            />
            {bgClass && (
              <div
                className={`page-pattern-overlay ${bgClass}`}
                style={{
                  top: settings.marginTop ?? 80,
                  height: pageH - (settings.marginTop ?? 80) - (settings.marginBottom ?? 120),
                  left: settings.marginLeft ?? 80,
                  right: settings.marginRight ?? 80,
                }}
              />
            )}
            {note.textboxes.filter(tb => !tb.wrapText).map(tb => (
              <FloatingTextbox
                key={tb.id}
                textbox={tb}
                onChange={updateTextbox}
                onDelete={deleteTextbox}
                isActive={activeTextboxId === tb.id}
                onFocus={() => { setActiveTextboxId(tb.id); setActiveImageId(null); }}
                onEditorReady={(ed) => { if (ed) setActiveTextboxEditor(ed); }}
              />
            ))}
            {(note.images ?? []).map(img => (
              <FloatingImageComponent
                key={img.id}
                image={img}
                onChange={updateImage}
                onDelete={deleteImage}
                isActive={activeImageId === img.id}
                onFocus={() => { setActiveImageId(img.id); setActiveTextboxId(null); }}
              />
            ))}
            <HeaderFooterBar
              data={safeHeader}
              type="header"
              noteTitle={note.title}
              pageNumber={1}
              marginLeft={settings.marginLeft ?? 80}
              marginRight={settings.marginRight ?? 80}
              height={settings.marginTop ?? 80}
              onChange={u => updateNote(note.id, { header: { ...safeHeader, ...u } })}
            />

            <div
              ref={editorContentRef}
              className="editor-content-area"
              style={{
                paddingTop: settings.marginTop ?? 80,
                paddingBottom: settings.marginBottom ?? 120,
                paddingLeft: settings.marginLeft ?? 80,
                paddingRight: settings.marginRight ?? 80,
                pointerEvents: drawMode ? 'none' : undefined,
                columnCount: (settings.pageColumns ?? 1) > 1 ? (settings.pageColumns ?? 1) : undefined,
                columnGap: (settings.pageColumns ?? 1) > 1 ? 32 : undefined,
                lineHeight: settings.lineHeight ?? 1.75,
              }}
            >
              {note.textboxes.filter(tb => tb.wrapText).map(tb => (
                <FloatingTextbox
                  key={tb.id}
                  textbox={tb}
                  onChange={updateTextbox}
                  onDelete={deleteTextbox}
                  isActive={activeTextboxId === tb.id}
                  onFocus={() => { setActiveTextboxId(tb.id); setActiveImageId(null); }}
                  onEditorReady={(ed) => { if (ed) setActiveTextboxEditor(ed); }}
                  floatMarginTop={Math.max(0, tb.y - (settings.marginTop ?? 80))}
                />
              ))}
              <EditorContent editor={editor} />
            </div>

            <HeaderFooterBar
              data={safeFooter}
              type="footer"
              noteTitle={note.title}
              pageNumber={1}
              marginLeft={settings.marginLeft ?? 80}
              marginRight={settings.marginRight ?? 80}
              height={settings.marginBottom ?? 120}
              topOverride={pageH - (settings.marginBottom ?? 120)}
              onChange={u => updateNote(note.id, { footer: { ...safeFooter, ...u } })}
            />
          </div>
        </div>

        {showAiChat && (
          <AiChatPanel note={note} notes={notes} onClose={() => setShowAiChat(false)} />
        )}
        {showToc && (
          <TocPanel editor={editor} onClose={() => setShowToc(false)} />
        )}
      </div>

      <div className="editor-statusbar">
        <span>{t('status.words', { n: wordCount })}</span>
        <span className="mx-2 opacity-40">·</span>
        <span>{t('status.chars', { n: charCount })}</span>
        {note.audioClips && note.audioClips.length > 0 && (
          <>
            <span className="mx-2 opacity-40">·</span>
            <span className="text-primary/70">🎤 {note.audioClips.length}</span>
          </>
        )}
        {note.versionHistory && note.versionHistory.length > 0 && (
          <>
            <span className="mx-2 opacity-40">·</span>
            <span className="opacity-50 text-[10px]">v{note.versionHistory.length}</span>
          </>
        )}
        <SaveIndicator updatedAt={note.updatedAt} />
        <span className="ml-auto opacity-40 text-[10px] tracking-wide">v2.0.0</span>
      </div>

      <VersionHistoryDialog note={note} open={showVersionHistory} onClose={() => setShowVersionHistory(false)} />
      <NoteEncryptDialog note={note} open={showEncrypt} onClose={() => setShowEncrypt(false)} />
      <MathInsertDialog open={showMath} onClose={() => setShowMath(false)} editor={editor} />
    </div>
  );
}
