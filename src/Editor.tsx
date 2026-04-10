import { useEffect, useState } from "react";
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
} from "lucide-react";
import { aiFixText, closeEditor, saveToNotion } from "./lib/tauri";

// Basit HTML → Markdown çevirimi (editörden Notion'a giderken)
function htmlToMarkdown(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  const lines: string[] = [];

  const walk = (node: Node) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) return;
      const el = n as HTMLElement;
      const tag = el.tagName?.toLowerCase();
      switch (tag) {
        case "h1":
          lines.push(`# ${el.textContent?.trim() ?? ""}`);
          break;
        case "h2":
          lines.push(`## ${el.textContent?.trim() ?? ""}`);
          break;
        case "h3":
          lines.push(`### ${el.textContent?.trim() ?? ""}`);
          break;
        case "p":
          lines.push(el.textContent?.trim() ?? "");
          break;
        case "blockquote":
          lines.push(`> ${el.textContent?.trim() ?? ""}`);
          break;
        case "ul":
          if (el.getAttribute("data-type") === "taskList") {
            el.querySelectorAll(":scope > li").forEach((li) => {
              const checked = li.getAttribute("data-checked") === "true";
              const text = li.textContent?.trim() ?? "";
              lines.push(`- [${checked ? "x" : " "}] ${text}`);
            });
          } else {
            el.querySelectorAll(":scope > li").forEach((li) => {
              lines.push(`- ${li.textContent?.trim() ?? ""}`);
            });
          }
          break;
        case "ol":
          el.querySelectorAll(":scope > li").forEach((li, i) => {
            lines.push(`${i + 1}. ${li.textContent?.trim() ?? ""}`);
          });
          break;
        case "hr":
          lines.push("---");
          break;
        case "pre": {
          const code = el.querySelector("code");
          lines.push("```");
          lines.push(code?.textContent ?? el.textContent ?? "");
          lines.push("```");
          break;
        }
        default:
          walk(el);
      }
    });
  };

  walk(div);
  return lines.filter((l) => l !== "").join("\n");
}

export default function Editor() {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

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
    content: "",
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const handleSave = async () => {
    if (!editor) return;
    const md = htmlToMarkdown(editor.getHTML());
    if (!title.trim() && !md.trim()) {
      setStatus("Boş not kaydedilemez");
      return;
    }
    setBusy(true);
    setStatus("Notion'a kaydediliyor…");
    try {
      const url = await saveToNotion(title, md);
      setStatus(`Kaydedildi → ${url}`);
      setTimeout(() => {
        setTitle("");
        editor.commands.clearContent();
        setStatus("");
        closeEditor();
      }, 900);
    } catch (e: any) {
      setStatus(`Hata: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setStatus("");
    closeEditor();
  };

  const handleAiFix = async () => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) {
      setStatus("Düzeltilecek metin yok");
      return;
    }
    setAiBusy(true);
    setStatus("AI düzeltiyor…");
    try {
      const fixed = await aiFixText(text, "fix");
      editor.commands.setContent(
        fixed
          .split("\n")
          .map((l) => `<p>${l}</p>`)
          .join(""),
      );
      setStatus("AI tamamladı");
      setTimeout(() => setStatus(""), 1500);
    } catch (e: any) {
      setStatus(`AI hata: ${e}`);
    } finally {
      setAiBusy(false);
    }
  };

  if (!editor) return null;

  const tb = (active: boolean, onClick: () => void, icon: any, title: string) => (
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
          <div className="title">yeni not</div>
          <button onClick={handleCancel} title="Kapat">
            <X size={14} />
          </button>
        </div>

        <div className="editor-toolbar">
          <div className="group">
            {tb(
              editor.isActive("heading", { level: 1 }),
              () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
              <Heading1 size={15} />,
              "Başlık 1",
            )}
            {tb(
              editor.isActive("heading", { level: 2 }),
              () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
              <Heading2 size={15} />,
              "Başlık 2",
            )}
            {tb(
              editor.isActive("heading", { level: 3 }),
              () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
              <Heading3 size={15} />,
              "Başlık 3",
            )}
          </div>

          <div className="group">
            {tb(
              editor.isActive("bold"),
              () => editor.chain().focus().toggleBold().run(),
              <Bold size={15} />,
              "Kalın",
            )}
            {tb(
              editor.isActive("italic"),
              () => editor.chain().focus().toggleItalic().run(),
              <Italic size={15} />,
              "İtalik",
            )}
            {tb(
              editor.isActive("underline"),
              () => editor.chain().focus().toggleUnderline().run(),
              <UnderlineIcon size={15} />,
              "Altı çizili",
            )}
            {tb(
              editor.isActive("strike"),
              () => editor.chain().focus().toggleStrike().run(),
              <Strikethrough size={15} />,
              "Üstü çizili",
            )}
            {tb(
              editor.isActive("code"),
              () => editor.chain().focus().toggleCode().run(),
              <Code size={15} />,
              "Inline code",
            )}
            {tb(
              editor.isActive("highlight"),
              () => editor.chain().focus().toggleHighlight().run(),
              <Highlighter size={15} />,
              "Vurgula",
            )}
          </div>

          <div className="group">
            {tb(
              editor.isActive("bulletList"),
              () => editor.chain().focus().toggleBulletList().run(),
              <List size={15} />,
              "Madde",
            )}
            {tb(
              editor.isActive("orderedList"),
              () => editor.chain().focus().toggleOrderedList().run(),
              <ListOrdered size={15} />,
              "Numaralı",
            )}
            {tb(
              editor.isActive("taskList"),
              () => editor.chain().focus().toggleTaskList().run(),
              <CheckSquare size={15} />,
              "To-do",
            )}
            {tb(
              editor.isActive("blockquote"),
              () => editor.chain().focus().toggleBlockquote().run(),
              <Quote size={15} />,
              "Alıntı",
            )}
            {tb(
              false,
              () => editor.chain().focus().setHorizontalRule().run(),
              <Minus size={15} />,
              "Ayraç",
            )}
            {tb(
              editor.isActive("link"),
              () => {
                const url = window.prompt("Link URL:");
                if (url) editor.chain().focus().setLink({ href: url }).run();
              },
              <LinkIcon size={15} />,
              "Link",
            )}
          </div>

          <div className="group" style={{ marginLeft: "auto" }}>
            <button
              onClick={handleAiFix}
              disabled={aiBusy}
              title="AI ile düzelt"
              style={{ color: "var(--accent-deep)" }}
            >
              {aiBusy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            </button>
          </div>
        </div>

        <input
          className="editor-title-input"
          placeholder="Başlıksız"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="editor-body">
          <EditorContent editor={editor} />
        </div>

        <div className="editor-footer">
          <div className="status">{status || "Ctrl+S kaydet · Esc iptal"}</div>
          <button className="btn ghost" onClick={handleCancel} disabled={busy}>
            İptal
          </button>
          <button className="btn primary" onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
