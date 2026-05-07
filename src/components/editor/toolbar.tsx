import { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, CheckSquare,
  Wand2, Square, Search, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Code, Heading1, Heading2, Heading3,
  Quote, Minus, CalendarDays, LayoutTemplate, Sparkles, ChevronDown, Languages, Pencil, ScanText,
  Mic, History, Lock, Unlock, Bot, FileText, Sigma, Link2,
  Subscript as SubscriptIcon, Superscript as SuperscriptIcon,
  IndentIncrease, IndentDecrease, RemoveFormatting, AlignVerticalSpaceAround,
  Info, BookOpen, Paintbrush, Undo2, Redo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { fixText, translateText, ocrImage, summarizeText, transcribeAudio, getProviderApiKey, getProviderModel } from '@/lib/ai';
import { useToast } from '@/hooks/use-toast';
import { useState, useRef, useEffect } from 'react';
import { Note, HeaderFooter, HFZone } from '@/lib/types';
import { HeaderFooterToggle } from './header-footer-bar';

interface ToolbarProps {
  editor: Editor | null;
  note: Note;
  drawMode: boolean;
  onToggleDrawMode: () => void;
  onAddTextbox: () => void;
  onAddImage: (src: string, alt: string) => void;
  onToggleFindReplace: () => void;
  onOpenMath: () => void;
  onOpenVersionHistory: () => void;
  onOpenEncrypt: () => void;
  onToggleAiChat: () => void;
  aiChatOpen: boolean;
  onToggleToc: () => void;
  tocOpen: boolean;
}

const HIGHLIGHT_COLORS = [
  '#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca',
  '#e9d5ff', '#fed7aa', '#ffffff', 'transparent',
];

const TEXT_COLORS = [
  '#000000', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#ffffff',
];

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;
}

interface ColorSwatchProps {
  colors: string[];
  onSelect: (color: string) => void;
  label: string;
  currentColor?: string;
  icon: React.ReactNode;
}

function ColorSwatch({ colors, onSelect, label, currentColor, icon }: ColorSwatchProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <button
        className="toolbar-color-btn"
        onClick={() => setOpen(o => !o)}
        title={label}
        style={{ '--color-indicator': currentColor || 'transparent' } as React.CSSProperties}
      >
        {icon}
        <span
          className="color-indicator"
          style={{ backgroundColor: currentColor && currentColor !== 'transparent' ? currentColor : undefined }}
        />
      </button>
      {open && (
        <div className="color-swatch-popup" onMouseLeave={() => setOpen(false)}>
          {colors.map(c => (
            <button
              key={c}
              className="color-swatch-item"
              style={{ backgroundColor: c === 'transparent' ? undefined : c }}
              onClick={() => { onSelect(c); setOpen(false); }}
              title={c}
            >
              {c === 'transparent' && <span className="text-[8px] leading-none">off</span>}
            </button>
          ))}
          <input
            type="color"
            className="color-swatch-custom"
            onChange={e => { onSelect(e.target.value); setOpen(false); }}
            title="Custom color"
          />
        </div>
      )}
    </div>
  );
}

interface CopiedFormat {
  bold: boolean; italic: boolean; underline: boolean; strike: boolean;
  code: boolean; subscript: boolean; superscript: boolean;
  color: string | null; fontSize: string | null; fontFamily: string | null;
  highlight: string | null; textAlign: string | null; lineHeight: string | null;
}

export function EditorToolbar({
  editor, note, drawMode, onToggleDrawMode, onAddTextbox, onAddImage,
  onToggleFindReplace, onOpenMath, onOpenVersionHistory,
  onOpenEncrypt, onToggleAiChat, aiChatOpen, onToggleToc, tocOpen,
}: ToolbarProps) {
  const { settings, updateNote, updateSettings } = useApp();
  const t = useT();
  const { toast } = useToast();
  const [isFixing, setIsFixing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isOcring, setIsOcring] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [spacingOpen, setSpacingOpen] = useState(false);
  const spacingRef = useRef<HTMLDivElement>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const caseRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const [calloutOpen, setCalloutOpen] = useState(false);
  const calloutRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  // ── Format Painter ──────────────────────────────────────────────────────────
  const [formatPainterActive, setFormatPainterActive] = useState(false);
  const copiedFormatRef = useRef<CopiedFormat | null>(null);
  const painterActiveRef = useRef(false);
  painterActiveRef.current = formatPainterActive;

  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom as HTMLElement;
    if (!formatPainterActive) {
      el.style.cursor = '';
      return;
    }
    el.style.cursor = 'crosshair';
    const onMouseUp = () => {
      if (!painterActiveRef.current || !copiedFormatRef.current) return;
      if (!editor.state.selection.empty) {
        const fmt = copiedFormatRef.current;
        const ch = editor.chain().focus();
        if (fmt.bold) ch.setBold(); else ch.unsetBold();
        if (fmt.italic) ch.setItalic(); else ch.unsetItalic();
        if (fmt.underline) ch.setUnderline(); else ch.unsetUnderline();
        if (fmt.strike) ch.setStrike(); else ch.unsetStrike();
        if (fmt.color) ch.setColor(fmt.color); else ch.unsetColor();
        if (fmt.fontSize) ch.setFontSize(fmt.fontSize); else ch.setFontSize('16pt');
        if (fmt.fontFamily) ch.setFontFamily(fmt.fontFamily); else ch.unsetFontFamily();
        if (fmt.highlight) ch.setHighlight({ color: fmt.highlight }); else ch.unsetHighlight();
        ch.run();
        if (fmt.textAlign) editor.chain().focus().setTextAlign(fmt.textAlign).run();
        if (fmt.lineHeight) editor.commands.setLineHeight(fmt.lineHeight);
        else editor.commands.unsetLineHeight();
        setFormatPainterActive(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setFormatPainterActive(false); };
    el.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      el.style.cursor = '';
    };
  }, [formatPainterActive, editor]);

  const handleFormatPainter = () => {
    if (!editor) return;
    if (formatPainterActive) { setFormatPainterActive(false); return; }
    const textStyle = editor.getAttributes('textStyle');
    const highlight = editor.getAttributes('highlight');
    let textAlign: string | null = null;
    let lineHeight: string | null = null;
    const { from } = editor.state.selection;
    editor.state.doc.nodesBetween(from, from, (node) => {
      if (node.isTextblock) {
        textAlign = (node.attrs.textAlign as string) || null;
        lineHeight = (node.attrs.lineHeight as string) || null;
        return false;
      }
      return true;
    });
    copiedFormatRef.current = {
      bold: editor.isActive('bold'), italic: editor.isActive('italic'),
      underline: editor.isActive('underline'), strike: editor.isActive('strike'),
      code: editor.isActive('code'), subscript: editor.isActive('subscript'),
      superscript: editor.isActive('superscript'),
      color: textStyle.color || null, fontSize: textStyle.fontSize || null,
      fontFamily: textStyle.fontFamily || null,
      highlight: highlight.color || null,
      textAlign, lineHeight,
    };
    setFormatPainterActive(true);
  };
  // ─────────────────────────────────────────────────────────────────────────────

  if (!editor) return null;

  const insertTranscript = (text: string) => {
    const paragraphs = text
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => ({
        type: 'paragraph',
        content: [{ type: 'text', text: p.replace(/\s*\n\s*/g, ' ') }],
      }));
    if (!paragraphs.length) return;
    editor.chain().focus().insertContent(paragraphs).run();
  };

  const handleVoiceToolbarClick = async () => {
    if (isVoiceProcessing) return;
    if (isVoiceRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    const provider = settings.provider ?? 'openrouter';
    if (provider === 'nvidia') {
      toast({
        title: t('voice.transcribe.error'),
        description: t('voice.openrouter.only'),
        variant: 'destructive',
      });
      return;
    }
    const apiKey = getProviderApiKey(settings);
    if (!apiKey) {
      toast({
        title: t('voice.transcribe.error'),
        description: t('ai.not.configured.desc'),
        variant: 'destructive',
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast({
        title: t('voice.transcribe.error'),
        description: t('voice.unsupported'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      voiceChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setIsVoiceRecording(false);
        setIsVoiceProcessing(true);
        stream.getTracks().forEach(track => track.stop());

        try {
          const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const rawText = await transcribeAudio(dataUrl, provider, apiKey);
          const model = getProviderModel(settings);
          const shouldFix = !!model && !model.toLowerCase().includes('whisper');
          const finalText = shouldFix
            ? await fixText(rawText, provider, apiKey, model)
            : rawText;

          insertTranscript(finalText);
          toast({ title: t('voice.inserted'), description: t('voice.transcribe') });
        } catch (err: any) {
          toast({
            title: t('voice.transcribe.error'),
            description: err.message || t('voice.transcribe.error'),
            variant: 'destructive',
          });
        } finally {
          setIsVoiceProcessing(false);
          mediaRecorderRef.current = null;
          voiceChunksRef.current = [];
        }
      };

      recorder.start();
      setIsVoiceRecording(true);
    } catch {
      toast({
        title: t('voice.transcribe.error'),
        description: t('voice.unsupported'),
        variant: 'destructive',
      });
    }
  };

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

  const handleInsertDate = () => {
    const locale = settings.language === 'tr' ? 'tr-TR' : 'en-US';
    const today = new Date().toLocaleDateString(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    editor.chain().focus().insertContent(today).run();
  };

  const applyCase = (mode: 'upper' | 'lower' | 'title' | 'sentence') => {
    const { from, to, empty } = editor.state.selection;
    let text = empty
      ? editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ')
      : editor.state.doc.textBetween(from, to, ' ');
    if (!text) return;

    const transform = (s: string) => {
      switch (mode) {
        case 'upper': return s.toLocaleUpperCase('tr-TR');
        case 'lower': return s.toLocaleLowerCase('tr-TR');
        case 'title': return s.replace(/\S+/g, w => {
          const f = w[0];
          const up = f === 'i' ? 'İ' : f === 'ı' ? 'I' : f.toLocaleUpperCase('tr-TR');
          return up + w.slice(1).toLocaleLowerCase('tr-TR');
        });
        case 'sentence': {
          const lower = s.toLocaleLowerCase('tr-TR');
          const f = lower[0];
          const up = f === 'i' ? 'İ' : f === 'ı' ? 'I' : f.toLocaleUpperCase('tr-TR');
          return up + lower.slice(1);
        }
      }
    };

    if (empty) {
      editor.commands.selectAll();
      editor.commands.insertContent(transform(text));
    } else {
      editor.chain().focus().setTextSelection({ from, to }).insertContent(transform(text)).run();
    }
  };

  const handleFixText = async () => {
    const apiKey = getProviderApiKey(settings);
    const model = getProviderModel(settings);
    if (!apiKey || !model) {
      toast({ title: t('ai.not.configured'), description: t('ai.not.configured.desc'), variant: 'destructive' });
      return;
    }

    const { state } = editor;
    const sel = state.selection;
    const isTextSelected = !sel.empty;

    type Para = { from: number; to: number; text: string; marks: ReturnType<typeof state.schema.text>['marks'] };
    const paragraphs: Para[] = [];

    const collectNode = (node: any, pos: number) => {
      if (!node.isTextblock) return;
      const from = pos + 1;
      const to   = pos + node.nodeSize - 1;
      if (from >= to) return;
      const text = node.textContent;
      if (!text.trim()) return;
      const marks: any[] = [];
      node.forEach((child: any) => { if (child.isText && marks.length === 0) marks.push(...child.marks); });
      paragraphs.push({ from, to, text, marks });
    };

    if (isTextSelected) {
      state.doc.nodesBetween(sel.from, sel.to, collectNode);
    } else {
      state.doc.descendants(collectNode);
    }

    if (!paragraphs.length) return;
    setIsFixing(true);
    try {
      const allText = paragraphs.map(p => p.text).join('\n');
      const fixedAll = await fixText(allText, settings.provider, apiKey, model);
      const fixedLines = fixedAll.split('\n');

      const tr = state.tr;
      for (let i = paragraphs.length - 1; i >= 0; i--) {
        const { from, to, marks } = paragraphs[i];
        const fixedContent = (fixedLines[i] ?? '').trim();
        if (!fixedContent) continue;
        const textNode = state.schema.text(fixedContent, marks);
        tr.replaceWith(from, to, textNode);
      }
      editor.view.dispatch(tr);
      toast({ title: t('ai.fix.success'), description: t('ai.fix.success.desc') });
    } catch (err: any) {
      toast({ title: t('ai.error'), description: err.message || t('ai.fix.success.desc'), variant: 'destructive' });
    } finally {
      setIsFixing(false);
    }
  };

  const handleTranslate = async () => {
    const apiKey = getProviderApiKey(settings);
    const model = getProviderModel(settings);
    if (!apiKey || !model) {
      toast({ title: t('ai.not.configured'), description: t('ai.not.configured.desc'), variant: 'destructive' });
      return;
    }

    const selection = editor.state.selection;
    const isTextSelected = !selection.empty;
    const textToTranslate = isTextSelected
      ? editor.state.doc.textBetween(selection.from, selection.to, '\n')
      : editor.getText();
    if (!textToTranslate.trim()) return;
    setIsTranslating(true);
    try {
      const target = settings.translateTarget ?? 'Türkçe';
      const translated = await translateText(
        textToTranslate,
        settings.provider,
        apiKey,
        model,
        target,
        settings.aiPrompts?.translate,
      );
      if (isTextSelected) {
        editor.commands.insertContentAt({ from: selection.from, to: selection.to }, translated);
      } else {
        editor.commands.setContent(translated);
      }
      toast({ title: t('ai.translate.success'), description: t('ai.translate.success.desc', { target }) });
    } catch (err: any) {
      toast({ title: t('ai.error'), description: err.message, variant: 'destructive' });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSummarize = async () => {
    const apiKey = getProviderApiKey(settings);
    const model = getProviderModel(settings);
    if (!apiKey || !model) {
      toast({ title: t('ai.not.configured'), description: t('ai.not.configured.desc'), variant: 'destructive' });
      return;
    }

    const text = editor.getText();
    if (!text.trim()) return;
    setIsSummarizing(true);
    try {
      const summary = await summarizeText(
        text,
        settings.provider,
        apiKey,
        model,
        settings.language ?? 'tr',
        settings.aiPrompts?.summarize,
      );
      const label = t('ai.summary.title');
      const html = `<h3>${label}</h3><p>${summary.replace(/\n/g, '</p><p>')}</p><hr>`;
      editor.chain().focus().insertContentAt(editor.state.doc.content.size, html).run();
      toast({ title: t('ai.summarize.success'), description: t('ai.summarize.success.desc') });
    } catch (err: any) {
      toast({ title: t('ai.error'), description: err.message, variant: 'destructive' });
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleInsertWikiLink = () => {
    const title = window.prompt(t('toolbar.wiki.prompt'));
    if (title?.trim()) {
      editor.chain().focus().insertContent(`[[${title.trim()}]]`).run();
    }
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const apiKey = settings.nvidiaApiKey;
    if (!apiKey) {
      toast({ title: 'NVIDIA API Key Required', description: 'Add your NVIDIA API key in Settings to use OCR.', variant: 'destructive' });
      return;
    }

    const cursorStyle = editor.getAttributes('textStyle');
    let ocrFontSize   = (cursorStyle.fontSize   as string) || '';
    let ocrFontFamily = (cursorStyle.fontFamily as string) || '';

    if (!ocrFontSize || !ocrFontFamily) {
      let lastFs = '';
      let lastFf = '';
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          for (const mark of node.marks) {
            if (mark.type.name === 'textStyle') {
              if (mark.attrs.fontSize)   lastFs = mark.attrs.fontSize  as string;
              if (mark.attrs.fontFamily) lastFf = mark.attrs.fontFamily as string;
            }
          }
        }
      });
      if (!ocrFontSize   && lastFs) ocrFontSize   = lastFs;
      if (!ocrFontFamily && lastFf) ocrFontFamily = lastFf;
    }

    if (!ocrFontSize) ocrFontSize = '12pt';

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setIsOcring(true);
      try {
        const text = await ocrImage(dataUrl, apiKey);
        if (!text) {
          toast({ title: 'No text found', description: 'No text could be extracted from the image.', variant: 'destructive' });
          return;
        }

        const lines = text.split('\n').filter(l => l.trim() !== '');
        const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        const spanStyle = [
          `font-size: ${ocrFontSize}`,
          ocrFontFamily ? `font-family: ${ocrFontFamily}` : '',
        ].filter(Boolean).join('; ');

        const contentHtml = lines
          .map(l => `<p><span style="${spanStyle}">${escape(l)}</span></p>`)
          .join('');

        const { state } = editor;
        const cursorPos = state.selection.from;
        const docSize   = state.doc.content.size;

        let insertAt = (cursorPos > 0 && cursorPos < docSize) ? cursorPos : docSize;
        if (insertAt === docSize) {
          state.doc.descendants((node, pos) => {
            if (node.isTextblock && node.textContent.trim().length > 0) {
              insertAt = pos + node.nodeSize - 1;
            }
          });
        }

        editor
          .chain()
          .focus()
          .setTextSelection(insertAt)
          .insertContent(contentHtml)
          .run();

        const lineCount = lines.filter(l => l.trim()).length;
        toast({ title: 'OCR complete', description: `${lineCount} line${lineCount !== 1 ? 's' : ''} extracted and inserted.` });
      } catch (err: any) {
        toast({ title: 'OCR failed', description: err.message || 'Could not extract text.', variant: 'destructive' });
      } finally {
        setIsOcring(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleInsertLink = () => {
    const url = window.prompt(t('toolbar.link.prompt'), 'https://');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  const handleInsertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onAddImage(reader.result, file.name.replace(/\.[^.]+$/, ''));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const isActive = (name: string, attrs?: object) => editor.isActive(name, attrs);

  return (
    <div className="toolbar-root">
      {/* Row 1 */}
      <div className="toolbar-row">
        <Button
          variant="ghost" size="icon"
          className="tbtn"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title={t('toolbar.undo') + ' (Ctrl+Z)'}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="tbtn"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title={t('toolbar.redo') + ' (Ctrl+Y)'}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>

        <Divider />

        <Select
          value={
            editor.isActive('heading', { level: 1 }) ? 'h1' :
            editor.isActive('heading', { level: 2 }) ? 'h2' :
            editor.isActive('heading', { level: 3 }) ? 'h3' :
            editor.isActive('codeBlock') ? 'code' :
            editor.isActive('blockquote') ? 'quote' :
            'p'
          }
          onValueChange={val => {
            if (val === 'h1') editor.chain().focus().setHeading({ level: 1 }).run();
            else if (val === 'h2') editor.chain().focus().setHeading({ level: 2 }).run();
            else if (val === 'h3') editor.chain().focus().setHeading({ level: 3 }).run();
            else if (val === 'code') editor.chain().focus().setCodeBlock().run();
            else if (val === 'quote') editor.chain().focus().setBlockquote().run();
            else editor.chain().focus().setParagraph().run();
          }}
        >
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="p">Normal</SelectItem>
            <SelectItem value="h1">Heading 1</SelectItem>
            <SelectItem value="h2">Heading 2</SelectItem>
            <SelectItem value="h3">Heading 3</SelectItem>
            <SelectItem value="code">Code Block</SelectItem>
            <SelectItem value="quote">Quote</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={editor.getAttributes('textStyle').fontFamily || 'Inter'}
          onValueChange={val => editor.chain().focus().setFontFamily(val).run()}
        >
          <SelectTrigger className="h-7 w-[140px] text-xs font-selector-trigger">
            <SelectValue placeholder="Font" />
          </SelectTrigger>
          <SelectContent className="max-h-[320px] overflow-y-auto font-selector-content">
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1">Sans Serif</SelectLabel>
              <SelectItem value="Inter" style={{ fontFamily: 'Inter' }}>Inter</SelectItem>
              <SelectItem value="Roboto" style={{ fontFamily: 'Roboto' }}>Roboto</SelectItem>
              <SelectItem value="Open Sans" style={{ fontFamily: '"Open Sans"' }}>Open Sans</SelectItem>
              <SelectItem value="Lato" style={{ fontFamily: 'Lato' }}>Lato</SelectItem>
              <SelectItem value="Poppins" style={{ fontFamily: 'Poppins' }}>Poppins</SelectItem>
              <SelectItem value="Nunito" style={{ fontFamily: 'Nunito' }}>Nunito</SelectItem>
              <SelectItem value="Raleway" style={{ fontFamily: 'Raleway' }}>Raleway</SelectItem>
              <SelectItem value="Montserrat" style={{ fontFamily: 'Montserrat' }}>Montserrat</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1">Serif</SelectLabel>
              <SelectItem value="Playfair Display" style={{ fontFamily: '"Playfair Display"' }}>Playfair Display</SelectItem>
              <SelectItem value="Merriweather" style={{ fontFamily: 'Merriweather' }}>Merriweather</SelectItem>
              <SelectItem value="Lora" style={{ fontFamily: 'Lora' }}>Lora</SelectItem>
              <SelectItem value="Libre Baskerville" style={{ fontFamily: '"Libre Baskerville"' }}>Libre Baskerville</SelectItem>
              <SelectItem value="Crimson Text" style={{ fontFamily: '"Crimson Text"' }}>Crimson Text</SelectItem>
              <SelectItem value="IBM Plex Serif" style={{ fontFamily: '"IBM Plex Serif"' }}>IBM Plex Serif</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1">Typewriter</SelectLabel>
              <SelectItem value="Special Elite" style={{ fontFamily: '"Special Elite"' }}>Special Elite</SelectItem>
              <SelectItem value="Courier Prime" style={{ fontFamily: '"Courier Prime"' }}>Courier Prime</SelectItem>
              <SelectItem value="Cutive Mono" style={{ fontFamily: '"Cutive Mono"' }}>Cutive Mono</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1">Developer</SelectLabel>
              <SelectItem value="JetBrains Mono" style={{ fontFamily: '"JetBrains Mono"' }}>JetBrains Mono</SelectItem>
              <SelectItem value="Fira Code" style={{ fontFamily: '"Fira Code"' }}>Fira Code</SelectItem>
              <SelectItem value="Source Code Pro" style={{ fontFamily: '"Source Code Pro"' }}>Source Code Pro</SelectItem>
              <SelectItem value="Roboto Mono" style={{ fontFamily: '"Roboto Mono"' }}>Roboto Mono</SelectItem>
              <SelectItem value="Space Mono" style={{ fontFamily: '"Space Mono"' }}>Space Mono</SelectItem>
              <SelectItem value="IBM Plex Mono" style={{ fontFamily: '"IBM Plex Mono"' }}>IBM Plex Mono</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={editor.getAttributes('textStyle').fontSize || '16pt'}
          onValueChange={val => editor.chain().focus().setFontSize(val).run()}
        >
          <SelectTrigger className="h-7 w-[68px] text-xs">
            <SelectValue placeholder="Size" />
          </SelectTrigger>
          <SelectContent>
            {['10', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48'].map(s => (
              <SelectItem key={s} value={`${s}pt`}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Divider />

        <ColorSwatch
          colors={TEXT_COLORS}
          onSelect={c => editor.chain().focus().setColor(c).run()}
          label="Text color"
          currentColor={editor.getAttributes('textStyle').color || '#000000'}
          icon={<span className="text-[11px] font-bold leading-none select-none">A</span>}
        />

        <ColorSwatch
          colors={HIGHLIGHT_COLORS}
          onSelect={c => {
            if (c === 'transparent') editor.chain().focus().unsetHighlight().run();
            else editor.chain().focus().setHighlight({ color: c }).run();
          }}
          label="Highlight color"
          currentColor={editor.getAttributes('highlight').color || '#fef08a'}
          icon={<span className="text-[11px] font-bold leading-none select-none" style={{ background: 'linear-gradient(to bottom, transparent 50%, #fef08a 50%)' }}>A</span>}
        />

        <Divider />

        <Button variant="ghost" size="icon" className={`tbtn ${isActive('bold') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${isActive('italic') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${isActive('underline') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${isActive('strike') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <Strikethrough className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${isActive('code') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
          <Code className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${isActive('subscript') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleSubscript().run()} title={t('format.subscript')}>
          <SubscriptIcon className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${isActive('superscript') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleSuperscript().run()} title={t('format.superscript')}>
          <SuperscriptIcon className="h-3.5 w-3.5" />
        </Button>

        <Divider />

        <Button variant="ghost" size="icon" className={`tbtn ${editor.getAttributes('paragraph').textAlign === 'left' || !editor.getAttributes('paragraph').textAlign ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align left">
          <AlignLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${editor.getAttributes('paragraph').textAlign === 'center' ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Center">
          <AlignCenter className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${editor.getAttributes('paragraph').textAlign === 'right' ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align right">
          <AlignRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${editor.getAttributes('paragraph').textAlign === 'justify' ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify">
          <AlignJustify className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="tbtn" onClick={() => editor.commands.indent()} title={t('format.indent')}>
          <IndentIncrease className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="tbtn" onClick={() => editor.commands.outdent()} title={t('format.outdent')}>
          <IndentDecrease className="h-3.5 w-3.5" />
        </Button>

        <div ref={spacingRef} className="relative">
          <button
            className="case-dropdown-trigger"
            title={t('format.line.spacing')}
            onClick={() => setSpacingOpen(v => !v)}
          >
            <AlignVerticalSpaceAround size={11} />
            <ChevronDown size={9} />
          </button>
          {spacingOpen && (
            <div className="case-dropdown-menu" onMouseLeave={() => setSpacingOpen(false)}>
              {([
                { value: '1',    labelKey: 'format.spacing.single' },
                { value: '1.15', labelKey: 'format.spacing.115' },
                { value: '1.5',  labelKey: 'format.spacing.150' },
                { value: '2',    labelKey: 'format.spacing.double' },
                { value: '2.5',  labelKey: 'format.spacing.250' },
                { value: '3',    labelKey: 'format.spacing.triple' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  className="case-menu-item"
                  onMouseDown={e => { e.preventDefault(); setSpacingOpen(false); editor.commands.setLineHeight(opt.value); }}
                >
                  <span className="case-preview" style={{ lineHeight: opt.value, fontSize: 11 }}>Aa</span>
                  <span className="case-desc">{t(opt.labelKey)}</span>
                </button>
              ))}
              <button
                className="case-menu-item"
                onMouseDown={e => { e.preventDefault(); setSpacingOpen(false); editor.commands.unsetLineHeight(); }}
              >
                <span className="case-preview" style={{ fontSize: 11 }}>Aa</span>
                <span className="case-desc">Default</span>
              </button>
            </div>
          )}
        </div>

        <Button
          variant="ghost" size="icon"
          className={`tbtn ${formatPainterActive ? 'tbtn-on ring-1 ring-primary' : ''}`}
          onClick={handleFormatPainter}
          title={formatPainterActive ? t('format.painter.active') : t('format.painter')}
        >
          <Paintbrush className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="tbtn" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title={t('format.clear')}>
          <RemoveFormatting className="h-3.5 w-3.5" />
        </Button>

        <Divider />

        <Button variant="ghost" size="icon" className={`tbtn ${isActive('bulletList') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${isActive('orderedList') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={`tbtn ${isActive('taskList') ? 'tbtn-on' : ''}`} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list">
          <CheckSquare className="h-3.5 w-3.5" />
        </Button>

        <div ref={calloutRef} className="relative">
          <button
            className="case-dropdown-trigger"
            title={t('toolbar.callout.add')}
            onClick={() => setCalloutOpen(v => !v)}
          >
            <Info size={11} />
            <ChevronDown size={9} />
          </button>
          {calloutOpen && (
            <div className="case-dropdown-menu" style={{ minWidth: 130 }} onMouseLeave={() => setCalloutOpen(false)}>
              {([
                { type: 'info'    as const, labelKey: 'toolbar.callout.info'    as const, color: '#3b82f6', emoji: 'ℹ️' },
                { type: 'warning' as const, labelKey: 'toolbar.callout.warning' as const, color: '#f59e0b', emoji: '⚠️' },
                { type: 'success' as const, labelKey: 'toolbar.callout.success' as const, color: '#22c55e', emoji: '✅' },
                { type: 'danger'  as const, labelKey: 'toolbar.callout.danger'  as const, color: '#ef4444', emoji: '🚫' },
              ]).map(({ type, labelKey, color, emoji }) => (
                <button
                  key={type}
                  className="case-menu-item"
                  onMouseDown={e => {
                    e.preventDefault();
                    setCalloutOpen(false);
                    editor.commands.insertCallout(type);
                  }}
                >
                  <span style={{ fontSize: 13 }}>{emoji}</span>
                  <span className="case-desc" style={{ color }}>{t(labelKey)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        <Button variant="ghost" size="icon" className="tbtn" onClick={handleInsertLink} title="Add link">
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="tbtn" onClick={handleInsertWikiLink} title={t('wiki.link.insert')}>
          <Link2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="tbtn" onClick={() => imageInputRef.current?.click()} title="Add image">
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <Button
          variant="ghost"
          size="icon"
          className={`tbtn ${isOcring ? 'opacity-60' : ''}`}
          onClick={() => ocrInputRef.current?.click()}
          disabled={isOcring}
          title="OCR — extract text from image (NVIDIA VIM)"
        >
          <ScanText className={`h-3.5 w-3.5 ${isOcring ? 'animate-pulse' : ''}`} />
        </Button>
        <input ref={ocrInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleOcrUpload} />
        <Button variant="ghost" size="icon" className="tbtn" onClick={handleInsertTable} title="Add table">
          <TableIcon className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="tbtn" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="tbtn" onClick={onAddTextbox} title="Add text box">
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="tbtn" onClick={handleInsertDate} title="Insert date">
          <CalendarDays className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="tbtn" onClick={onOpenMath} title={t('math.insert')}>
          <Sigma className="h-3.5 w-3.5" />
        </Button>

        <Divider />

        {/* Case transforms */}
        <div ref={caseRef} className="relative">
          <button
            className="case-dropdown-trigger"
            title="Letter case"
            onClick={() => setCaseOpen(v => !v)}
          >
            <span style={{ fontWeight: 700, fontSize: 11 }}>Aa</span>
            <ChevronDown size={9} />
          </button>
          {caseOpen && (
            <div className="case-dropdown-menu" onMouseLeave={() => setCaseOpen(false)}>
              <button className="case-menu-item" onMouseDown={e => { e.preventDefault(); setCaseOpen(false); applyCase('upper'); }}>
                <span className="case-preview">UPPERCASE</span>
                <span className="case-desc">All uppercase</span>
              </button>
              <button className="case-menu-item" onMouseDown={e => { e.preventDefault(); setCaseOpen(false); applyCase('lower'); }}>
                <span className="case-preview" style={{ textTransform: 'none' }}>lowercase</span>
                <span className="case-desc">All lowercase</span>
              </button>
              <button className="case-menu-item" onMouseDown={e => { e.preventDefault(); setCaseOpen(false); applyCase('title'); }}>
                <span className="case-preview" style={{ textTransform: 'none' }}>Title Case</span>
                <span className="case-desc">Each word capitalized</span>
              </button>
              <button className="case-menu-item" onMouseDown={e => { e.preventDefault(); setCaseOpen(false); applyCase('sentence'); }}>
                <span className="case-preview" style={{ textTransform: 'none' }}>Sentence case</span>
                <span className="case-desc">Only first letter uppercase</span>
              </button>
            </div>
          )}
        </div>

        <Divider />

        <button
          className={`autocorrect-toggle-btn ${(settings.autoCorrect ?? false) ? 'autocorrect-toggle-on' : ''}`}
          onClick={() => updateSettings({ autoCorrect: !(settings.autoCorrect ?? false) })}
          title={`Auto Fix ${settings.autoCorrect ? 'on' : 'off'} — AI corrects last word on spacebar`}
        >
          <Sparkles size={11} />
          <span>Auto Fix</span>
        </button>

        <Divider />

        <HeaderFooterToggle
          data={safeHeader}
          type="header"
          onChange={u => updateNote(note.id, { header: { ...safeHeader, ...u } })}
        />
        <HeaderFooterToggle
          data={safeFooter}
          type="footer"
          onChange={u => updateNote(note.id, { footer: { ...safeFooter, ...u } })}
        />

        <Divider />

        <Button variant="ghost" size="icon" className="tbtn" onClick={onToggleFindReplace} title="Find & Replace (Ctrl+F)">
          <Search className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={`tbtn ${tocOpen ? 'tbtn-on' : ''}`}
          onClick={onToggleToc}
          title={t('toolbar.toc')}
        >
          <BookOpen className="h-3.5 w-3.5" />
        </Button>

        <Divider />

        <Button
          variant="ghost"
          size="icon"
          className={`tbtn ${isVoiceRecording ? 'tbtn-on voice-recording-btn' : ''} ${isVoiceProcessing ? 'opacity-60' : ''}`}
          onClick={handleVoiceToolbarClick}
          title={isVoiceRecording ? t('voice.stop') : t('voice.record')}
          disabled={isVoiceProcessing}
        >
          <Mic className={`h-3.5 w-3.5 ${isVoiceRecording ? 'animate-pulse text-red-500' : ''} ${isVoiceProcessing ? 'animate-pulse' : ''}`} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="tbtn"
          onClick={onOpenVersionHistory}
          title={t('version.title')}
        >
          <History className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={`tbtn ${note.encrypted ? 'text-amber-500' : ''}`}
          onClick={onOpenEncrypt}
          title={note.encrypted ? t('encrypt.unlock.title') : t('encrypt.lock.title')}
        >
          {note.encrypted ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        </Button>

        <Divider />

        <Button
          variant="ghost"
          size="sm"
          className={`h-7 text-xs gap-1 px-2 ${drawMode ? 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/30' : 'text-muted-foreground'}`}
          onClick={onToggleDrawMode}
          title="Toggle drawing mode"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          className={`h-7 text-xs gap-1 px-2 ${isSummarizing ? 'opacity-70' : 'text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/40'}`}
          onClick={handleSummarize}
          disabled={isSummarizing || isFixing || isTranslating}
          title={t('toolbar.summarize')}
        >
          <FileText className={`h-3.5 w-3.5 ${isSummarizing ? 'animate-pulse' : ''}`} />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={`h-7 text-xs gap-1 px-2 ${isTranslating ? 'opacity-70' : 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'}`}
          onClick={handleTranslate}
          disabled={isTranslating || isFixing}
          title="AI translate to Turkish — translates selected text or entire page"
        >
          <Languages className={`h-3.5 w-3.5 ${isTranslating ? 'animate-pulse' : ''}`} />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={`h-7 text-xs gap-1 px-2 ${isFixing ? 'opacity-70' : 'text-primary hover:bg-primary/10'}`}
          onClick={handleFixText}
          disabled={isFixing || isTranslating}
          title="AI Fix"
        >
          <Wand2 className={`h-3.5 w-3.5 ${isFixing ? 'animate-pulse' : ''}`} />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={`h-7 text-xs gap-1 px-2 ${aiChatOpen ? 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/30' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={onToggleAiChat}
          title="AI Asistan"
        >
          <Bot className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Row 2: table controls */}
      {isActive('table') && (
        <div className="toolbar-row toolbar-row-secondary">
          <span className="text-[11px] text-muted-foreground mr-1">Table:</span>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => editor.chain().focus().addColumnBefore().run()}>+ Col before</Button>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Col after</Button>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => editor.chain().focus().deleteColumn().run()}>− Col</Button>
          <Divider />
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => editor.chain().focus().addRowBefore().run()}>+ Row before</Button>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row after</Button>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => editor.chain().focus().deleteRow().run()}>− Row</Button>
          <Divider />
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-destructive" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</Button>
        </div>
      )}
    </div>
  );
}
