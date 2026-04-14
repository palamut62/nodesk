import { useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
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
  Trash2,
} from "lucide-react";
import { mdToHtml, htmlToMd, txtToHtml, htmlToTxt } from "./lib/fileFormat";
import {
  aiFixText,
  deleteNote,
  parseTags,
  readTextFile,
  saveNote,
  startLiveWhisper,
  tagPastelColor,
  writeTextFile,
  type LiveWhisperSession,
  type Note,
} from "./lib/tauri";
import { confirmDialog, promptDialog } from "./components/Dialog";
import ErrorBubble from "./components/ErrorBubble";
import { sanitizeAiHtml } from "./lib/aiHtml";
import { useT } from "./lib/i18n";

interface Props {
  noteToLoad: Note | null;
  onClose: () => void;
}

function getErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value ?? "Bilinmeyen hata");
}

export default function Editor({ noteToLoad, onClose }: Props) {
  const t = useT();
  const [currentId, setCurrentId] = useState<number | null>(noteToLoad?.id ?? null);
  const [title, setTitle] = useState(noteToLoad?.title ?? "");
  const [tagsInput, setTagsInput] = useState(noteToLoad?.tags ?? "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const liveRef = useRef<LiveWhisperSession | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: t("notePlaceholder") }),
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

  const showError = (value: unknown, prefix?: string) => {
    const message = getErrorMessage(value);
    setError(prefix ? `${prefix}: ${message}` : message);
  };

  useEffect(() => {
    if (!editor) return;
    setCurrentId(noteToLoad?.id ?? null);
    setTitle(noteToLoad?.title ?? "");
    setTagsInput(noteToLoad?.tags ?? "");
    editor.commands.setContent(noteToLoad?.content ?? "");
    setStatus("");
    setError("");
  }, [editor, noteToLoad]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        void toggleVoice();
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
      void toggleVoice();
    });
    const unDown = listen("voice-ptt-down", () => {
      if (recordingRef.current || transcribing) return;
      void toggleVoice();
    });
    const unUp = listen("voice-ptt-up", () => {
      if (!recordingRef.current) return;
      void toggleVoice();
    });

    return () => {
      unToggle.then((f) => f());
      unDown.then((f) => f());
      unUp.then((f) => f());
    };
  }, [transcribing]);

  const persistEditorNote = async (nextTitle?: string) => {
    if (!editor) return currentId;
    const html = editor.getHTML();
    const plain = editor.getText().trim();
    const resolvedTitle = nextTitle ?? title;

    if (!resolvedTitle.trim() && !plain) return currentId;

    const savedId = await saveNote(currentId, resolvedTitle, html, tagsInput);
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

    let processed = trimmed;
    try {
      setStatus(t("aiFixing"));
      const fixed = await aiFixText(trimmed, "fix");
      const clean = fixed.trim();
      if (clean && !clean.startsWith("[HATA]")) processed = clean;
    } catch (err) {
      showError(err, "AI");
    }

    editor.chain().focus().insertContent(`${processed} `).run();
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
    setError("");
    setStatus(t("voiceNoteSaved"));
    window.setTimeout(() => setStatus(""), 1500);
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
      } catch (e: unknown) {
        showError(e);
      } finally {
        setTranscribing(false);
      }
      return;
    }

    if (!editor) return;

    try {
      const session = await startLiveWhisper({
        intervalMs: 3500,
        onPartial: (partial) => {
          setStatus(`REC ${partial.length > 60 ? `...${partial.slice(-60)}` : partial}`);
        },
      });
      liveRef.current = session;
      setRecording(true);
      setError("");
      setStatus(t("recording"));
    } catch (e: unknown) {
      showError(e, "Mikrofon");
    }
  };

  const handleOpenFile = async () => {
    try {
      const picked = await openDialog({
        multiple: false,
        filters: [
          { name: "Metin / Markdown", extensions: ["txt", "md", "markdown"] },
          { name: "Tum dosyalar", extensions: ["*"] },
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
      setError("");
      setStatus(`Acildi: ${name}`);
      window.setTimeout(() => setStatus(""), 2000);
    } catch (e: unknown) {
      showError(e, "Acma hatasi");
    }
  };

  const handleExportFile = async () => {
    if (!editor) return;
    try {
      const path = await saveDialog({
        defaultPath: `${title || "not"}.md`,
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
      setError("");
      setStatus(`Kaydedildi: ${path.split(/[\\/]/).pop()}`);
      window.setTimeout(() => setStatus(""), 2000);
    } catch (e: unknown) {
      showError(e, "Disa aktarma hatasi");
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
      const savedId = await saveNote(currentId, title, html, tagsInput);
      if (currentId == null) {
        setCurrentId(savedId);
      }
      setError("");
      setStatus(currentId ? t("updated") : t("savedNote"));
      window.setTimeout(() => onClose(), 350);
    } catch (e: unknown) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (currentId == null) return;

    const ok = await confirmDialog({
      title: t("deleteNote"),
      message: t("deleteConfirm"),
      confirmText: t("delete"),
      cancelText: t("giveUp"),
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await deleteNote(currentId);
      setError("");
      setStatus(t("deletedNote"));
      window.setTimeout(() => onClose(), 180);
    } catch (e: unknown) {
      showError(e);
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
      setError("");
      setStatus(t("aiDone"));
      window.setTimeout(() => setStatus(""), 1500);
    } catch (e: unknown) {
      showError(e, "AI");
    } finally {
      setAiBusy(false);
    }
  };

  if (!editor) return null;

  const tb = (active: boolean, onClick: () => void, icon: ReactNode, titleText: string) => (
    <button
      className={active ? "active" : ""}
      onClick={onClick}
      title={titleText}
      type="button"
    >
      {icon}
    </button>
  );

  return (
    <div className="editor-shell">
      <div className="editor-card">
        {error && <ErrorBubble message={error} onClose={() => setError("")} />}

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
                  placeholder: "https://...",
                  confirmText: t("add"),
                });
                if (url) {
                  editor.chain().focus().setLink({ href: url }).run();
                }
              },
              <LinkIcon size={15} />,
              t("link"),
            )}
          </div>

          <div className="group" style={{ marginLeft: "auto" }}>
            <button
              onClick={() => void toggleVoice()}
              title={t("voiceNote")}
              className={recording ? "mic-recording" : ""}
              style={{ color: recording ? undefined : "var(--accent-deep)" }}
            >
              <Mic size={15} />
            </button>
            <button
              onClick={() => void handleAiFix()}
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

        <div className="editor-tags-row">
          <input
            className="editor-tags-input"
            placeholder="etiketler (virgülle ayır)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
          <div className="editor-tags-preview">
            {parseTags(tagsInput).map((tag) => {
              const c = tagPastelColor(tag);
              return (
                <span
                  key={tag}
                  className="tag-chip"
                  style={{ background: c.bg, color: c.fg }}
                >
                  {tag}
                </span>
              );
            })}
          </div>
        </div>

        <div className="editor-body">
          <EditorContent editor={editor} />
        </div>

        <div className="editor-footer">
          <div className="status">{status || t("statusHint")}</div>

          {currentId != null && (
            <button
              className="btn danger icon-only"
              onClick={() => void handleDelete()}
              disabled={busy}
              title={t("delete")}
              aria-label={t("delete")}
            >
              <Trash2 size={14} />
            </button>
          )}

          <button
            className="btn ghost icon-only"
            onClick={() => {
              const text = editor.getText();
              if (!text.trim()) {
                setStatus(t("nothingToCopy"));
                return;
              }
              navigator.clipboard.writeText(text).then(() => {
                setError("");
                setStatus(t("copied"));
                window.setTimeout(() => setStatus(""), 1500);
              });
            }}
            disabled={busy}
            title={t("copy")}
            aria-label={t("copy")}
          >
            <Copy size={14} />
          </button>

          <button
            className="btn ghost icon-only"
            onClick={() => void handleOpenFile()}
            disabled={busy}
            title={t("open")}
            aria-label={t("open")}
          >
            <FolderOpen size={14} />
          </button>

          <button
            className="btn ghost icon-only"
            onClick={() => void handleExportFile()}
            disabled={busy}
            title={t("export")}
            aria-label={t("export")}
          >
            <FileDown size={14} />
          </button>

          <button className="btn ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>

          <button className="btn primary" onClick={() => void handleSave()} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
