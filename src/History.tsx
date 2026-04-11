import { useCallback, useEffect, useState } from "react";
import { Trash2, X, Pencil, Search, FileText, Plus, Sparkles, Loader2 } from "lucide-react";
import { aiFixText, deleteNote, getNote, listNotes, saveNote, type Note } from "./lib/tauri";
import { confirmDialog } from "./components/Dialog";
import { sanitizeAiHtml } from "./lib/aiHtml";

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() ?? "";
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  onOpenNote: (id: number) => void;
  onNewNote: () => void;
  onClose: () => void;
}

export default function History({ onOpenNote, onNewNote, onClose }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiBusyId, setAiBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listNotes();
      setNotes(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [refresh, onClose]);

  const filtered = notes.filter((n) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      stripHtml(n.content).toLowerCase().includes(q)
    );
  });

  const handleAiFix = async (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    if (aiBusyId != null) return;
    setAiBusyId(note.id);
    try {
      const full = await getNote(note.id);
      const plain = stripHtml(full.content);
      if (!plain) return;
      const fixed = await aiFixText(plain, "fix");
      await saveNote(note.id, full.title, sanitizeAiHtml(fixed));
      await refresh();
    } catch (err) {
      console.error("[history] ai fix err", err);
    } finally {
      setAiBusyId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: "Notu sil",
      message: "Bu notu kalıcı olarak silmek istediğine emin misin?",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!ok) return;
    await deleteNote(id);
    await refresh();
  };

  return (
    <div className="editor-shell">
      <div className="editor-card">
        <div className="editor-titlebar">
          <button onClick={onNewNote} title="Yeni not">
            <Plus size={14} />
          </button>
          <div className="title">geçmiş notlar</div>
          <button onClick={onClose} title="Kapat">
            <X size={14} />
          </button>
        </div>

        <div className="history-search">
          <Search size={14} />
          <input
            placeholder="Ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="history-list">
          {loading && <div className="history-empty">Yükleniyor…</div>}
          {!loading && filtered.length === 0 && (
            <div className="history-empty">
              <FileText size={28} />
              <span>{query ? "Eşleşen not yok" : "Henüz not yok"}</span>
            </div>
          )}
          {filtered.map((n) => {
            const preview = stripHtml(n.content).slice(0, 80);
            return (
              <div
                key={n.id}
                className="history-item"
                onClick={() => onOpenNote(n.id)}
              >
                <div className="history-item-main">
                  <div className="history-item-title">
                    {n.title.trim() || "Başlıksız"}
                  </div>
                  {preview && (
                    <div className="history-item-preview">{preview}</div>
                  )}
                  <div className="history-item-date">
                    {formatDate(n.updated_at)}
                  </div>
                </div>
                <div className="history-item-actions">
                  <button
                    title="AI ile düzelt"
                    disabled={aiBusyId != null}
                    onClick={(e) => handleAiFix(e, n)}
                    style={{ color: "var(--accent-deep)" }}
                  >
                    {aiBusyId === n.id ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                  </button>
                  <button
                    title="Düzenle"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenNote(n.id);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    title="Sil"
                    className="danger"
                    onClick={(e) => handleDelete(e, n.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
