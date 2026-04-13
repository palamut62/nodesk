import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Link as LinkIcon,
  Highlighter,
  Sparkles,
  Save,
  X,
  Loader2,
  Mic,
  FolderOpen,
  FileDown,
  Copy,
} from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { mdToHtml, htmlToMd, txtToHtml, htmlToTxt } from "./lib/fileFormat";
import {
  aiFixText,
  saveNote,
  startLiveWhisper,
  readTextFile,
  writeTextFile,
  type LiveWhisperSession,
  type Note,
} from "./lib/tauri";
import { promptDialog } from "./components/Dialog";
import { sanitizeAiHtml } from "./lib/aiHtml";
import { useT } from "./lib/i18n";

interface Props {
  noteToLoad: Note | null;
  onClose: () => void;
}

export default function Editor({ noteToLoad, onClose }: Props) {
  const t = useT();
  const [currentId, setCurrentId] = useState<number | null>(
    noteToLoad?.id ?? null,
  );
  const [title, setTitle] = useState(noteToLoad?.title ?? "");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const liveRef = useRef<LiveWhisperSession | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "Notun buraya…" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Highlight,
      Underline,
      TextStyle,
      Color,
    ],
    content: noteToLoad?.content ?? "",
  });

  // noteToLoad değiştiğinde içeriği güncelle
  useEffect(() => {
    if (!editor) return;
    setCurrentId(noteToLoad?.id ?? null);
    setTitle(noteToLoad?.title ?? "");
    editor.commands.setContent(noteToLoad?.content ?? "");
    setStatus("");
  }, [editor, noteToLoad]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === "v" || e.key === "V")
      ) {
        e.preventDefault();
        toggleVoice();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const recordingRef = useRef(false);
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    const unToggle = listen("voice-note-toggle", () => {
      toggleVoice();
    });
    const unDown = listen("voice-ptt-down", () => {
      if (recordingRef.current || transcribing) return;
      toggleVoice();
    });
    const unUp = listen("voice-ptt-up", () => {
      if (!recordingRef.current) return;
      toggleVoice();
    });
    return () => {
      unToggle.then((f) => f());
      unDown.then((f) => f());
      unUp.then((f) => f());
    };
  }, []);

  const persistEditorNote = async (nextTitle?: string) => {
    if (!editor) return currentId;
    const html = editor.getHTML();
    const plain = editor.getText().trim();
    const resolvedTitle = nextTitle ?? title;

    if (!resolvedTitle.trim() && !plain) return currentId;

    const savedId = await saveNote(currentId, resolvedTitle, html);
    if (currentId == null) {
      setCurrentId(savedId);
    }
    if (nextTitle != null && nextTitle !== title) {
      setTitle(nextTitle);
    }
    return savedId;
  };

  const insertTranscript = async (text: string) => {
    if (!editor) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus(t("noSound"));
      return;
    }
    // AI ile duzelt
    let processed = trimmed;
    try {
      setStatus(t("aiFixing"));
      const fixed = await aiFixText(trimmed, "fix");
      const clean = fixed.trim();
      if (clean && !clean.startsWith("[HATA]")) processed = clean;
    } catch {
      // AI basarisizsa ham metni ekle
    }
    editor.chain().focus().insertContent(processed + " ").run();
    const plainBeforeTitle = editor.getText().trim();
    const autoTitle =
      title.trim() ||
      (currentId == null && plainBeforeTitle
        ? `${t("voiceNoteTitle")} · ${new Date().toLocaleString("tr-TR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : undefined);
    await persistEditorNote(autoTitle);
    setStatus(t("voiceNoteSaved"));
    setTimeout(() => setStatus(""), 1500);
  };

  const toggleVoice = async () => {
    if (transcribing) return;
    if (recording) {
      const session = liveRef.current;
      if (!session) return;
      liveRef.current = null;
      setRecording(false);
      setTranscribing(true);
      setStatus(t("processing"));
      try {
        const text = await session.stop();
        await insertTranscript(text);
      } catch (e: any) {
        setStatus(`Hata: ${e}`);
      } finally {
        setTranscribing(false);
      }
      return;
    }
    if (!editor) return;
    try {
      const session = await startLiveWhisper({
        intervalMs: 3500,
        onPartial: (t) => {
          setStatus(`🔴 ${t.length > 60 ? "…" + t.slice(-60) : t}`);
        },
      });
      liveRef.current = session;
      setRecording(true);
      setStatus(t("recording"));
    } catch (e: any) {
      setStatus(`Mikrofon: ${e}`);
    }
  };

  const handleOpenFile = async () => {
    try {
      const picked = await openDialog({
        multiple: false,
        filters: [
          { name: "Metin / Markdown", extensions: ["txt", "md", "markdown"] },
          { name: "Tümü", extensions: ["*"] },
        ],
      });
      if (!picked || typeof picked !== "string") return;
      const content = await readTextFile(picked);
      const name = picked.split(/[\\/]/).pop() || "";
      const base = name.replace(/\.(txt|md|markdown)$/i, "");
      const isMd = /\.(md|markdown)$/i.test(name);
      if (!editor) return;
      const html = isMd ? await mdToHtml(content) : txtToHtml(content);
      editor.commands.setContent(html);
      setTitle(base);
      setStatus(`Açıldı: ${name}`);
      setTimeout(() => setStatus(""), 2000);
    } catch (e: any) {
      setStatus(`Açma hatası: ${e}`);
    }
  };

  const handleExportFile = async () => {
    if (!editor) return;
    try {
      const path = await saveDialog({
        defaultPath: (title || "not") + ".md",
        filters: [
          { name: "Markdown", extensions: ["md"] },
          { name: "Metin", extensions: ["txt"] },
        ],
      });
      if (!path) return;
      const isMd = /\.(md|markdown)$/i.test(path);
      const html = editor.getHTML();
      const content = isMd ? htmlToMd(html) : htmlToTxt(html);
      await writeTextFile(path, content);
      setStatus(`Kaydedildi: ${path.split(/[\\/]/).pop()}`);
      setTimeout(() => setStatus(""), 2000);
    } catch (e: any) {
      setStatus(`Kaydetme hatası: ${e}`);
    }
  };

  const handleSave = async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const plain = editor.getText();
    if (!title.trim() && !plain.trim()) {
      setStatus(t("emptyNote"));
      return;
    }
    setBusy(true);
    setStatus(currentId ? t("updating") : t("saving"));
    try {
      const savedId = await saveNote(currentId, title, html);
      if (currentId == null) {
        setCurrentId(savedId);
      }
      setStatus(currentId ? t("updated") : t("savedNote"));
      setTimeout(() => {
        onClose();
      }, 350);
    } catch (e: any) {
      setStatus(`Hata: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAiFix = async () => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) {
      setStatus(t("noTextToFix"));
      return;
    }
    setAiBusy(true);
    setStatus(t("aiFixing"));
    try {
      const fixed = await aiFixText(text, "fix");
      editor.commands.setContent(sanitizeAiHtml(fixed));
      setStatus(t("aiDone"));
      setTimeout(() => setStatus(""), 1500);
    } catch (e: any) {
      setStatus(`AI hata: ${e}`);
    } finally {
      setAiBusy(false);
    }
  };

  if (!editor) return null;

  const tb = (
    active: boolean,
    onClick: () => void,
    icon: any,
    title: string,
  ) => (
    <button
      className={active ? "active" : ""}
      onClick={onClick}
      title={title}
      type="button"
    >
      {icon}
    </button>
  );

  return (
    <div className="editor-shell">
      <div className="editor-card">
        <div className="editor-titlebar">
          <div style={{ width: 26 }} />
          <div className="title">{currentId ? t("editNote") : t("newNoteTitle")}</div>
          <button onClick={onClose} title={t("close")}>
            <X size={14} />
          </button>
        </div>

        <div className="editor-toolbar">
          <div className="group">
            {tb(
              editor.isActive("heading", { level: 1 }),
              () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
              <Heading1 size={15} />,
              t("heading1"),
            )}
            {tb(
              editor.isActive("heading", { level: 2 }),
              () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
              <Heading2 size={15} />,
              t("heading2"),
            )}
            {tb(
              editor.isActive("heading", { level: 3 }),
              () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
              <Heading3 size={15} />,
              t("heading3"),
            )}
          </div>

          <div className="group">
            {tb(
              editor.isActive("bold"),
              () => editor.chain().focus().toggleBold().run(),
              <Bold size={15} />,
              t("bold"),
            )}
            {tb(
              editor.isActive("italic"),
              () => editor.chain().focus().toggleItalic().run(),
              <Italic size={15} />,
              t("italic"),
            )}
            {tb(
              editor.isActive("underline"),
              () => editor.chain().focus().toggleUnderline().run(),
              <UnderlineIcon size={15} />,
              t("underline"),
            )}
            {tb(
              editor.isActive("strike"),
              () => editor.chain().focus().toggleStrike().run(),
              <Strikethrough size={15} />,
              t("strikethrough"),
            )}
            {tb(
              editor.isActive("code"),
              () => editor.chain().focus().toggleCode().run(),
              <Code size={15} />,
              t("inlineCode"),
            )}
            {tb(
              editor.isActive("highlight"),
              () => editor.chain().focus().toggleHighlight().run(),
              <Highlighter size={15} />,
              t("highlight"),
            )}
          </div>

          <div className="group">
            {tb(
              editor.isActive("bulletList"),
              () => editor.chain().focus().toggleBulletList().run(),
              <List size={15} />,
              t("bullet"),
            )}
            {tb(
              editor.isActive("orderedList"),
              () => editor.chain().focus().toggleOrderedList().run(),
              <ListOrdered size={15} />,
              t("numbered"),
            )}
            {tb(
              editor.isActive("taskList"),
              () => editor.chain().focus().toggleTaskList().run(),
              <CheckSquare size={15} />,
              t("todo"),
            )}
            {tb(
              editor.isActive("blockquote"),
              () => editor.chain().focus().toggleBlockquote().run(),
              <Quote size={15} />,
              t("quote"),
            )}
            {tb(
              false,
              () => editor.chain().focus().setHorizontalRule().run(),
              <Minus size={15} />,
              t("divider"),
            )}
            {tb(
              editor.isActive("link"),
              async () => {
                const url = await promptDialog({
                  title: t("addLink"),
                  message: t("enterUrl"),
                  placeholder: "https://…",
                  confirmText: t("add"),
                });
                if (url) editor.chain().focus().setLink({ href: url }).run();
              },
              <LinkIcon size={15} />,
              t("link"),
            )}
          </div>

          <div className="group" style={{ marginLeft: "auto" }}>
            <button
              onClick={toggleVoice}
              title={t("voiceNote")}
              className={recording ? "mic-recording" : ""}
              style={{ color: recording ? undefined : "var(--accent-deep)" }}
            >
              <Mic size={15} />
            </button>
            <button
              onClick={handleAiFix}
              disabled={aiBusy}
              title={t("aiFix")}
              style={{ color: "var(--accent-deep)" }}
            >
              {aiBusy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            </button>
          </div>
        </div>

        <input
          className="editor-title-input"
          placeholder={t("untitled")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="editor-body">
          <EditorContent editor={editor} />
        </div>

        <div className="editor-footer">
          <div className="status">
            {status || t("statusHint")}
          </div>
          <button
            className="btn ghost"
            onClick={() => {
              if (!editor) return;
              const text = editor.getText();
              if (!text.trim()) { setStatus(t("nothingToCopy")); return; }
              navigator.clipboard.writeText(text).then(() => {
                setStatus(t("copied"));
                setTimeout(() => setStatus(""), 1500);
              });
            }}
            disabled={busy}
            title="Notu kopyala"
          >
            <Copy size={14} /> {t("copy")}
          </button>
          <button className="btn ghost" onClick={handleOpenFile} disabled={busy} title="TXT / MD">
            <FolderOpen size={14} /> {t("open")}
          </button>
          <button className="btn ghost" onClick={handleExportFile} disabled={busy} title="TXT / MD">
            <FileDown size={14} /> {t("export")}
          </button>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button className="btn primary" onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
