import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { confirmDialog } from "./components/Dialog";
import ErrorBubble from "./components/ErrorBubble";
import { sanitizeAiHtml } from "./lib/aiHtml";
import { useT } from "./lib/i18n";
import { aiFixText, deleteNote, getNote, listNotes, saveNote, type Note } from "./lib/tauri";

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() ?? "";
}

function formatShortDate(ms: number): string {
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

function formatLongDate(ms: number): string {
  return new Date(ms).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value ?? "Bilinmeyen hata");
}

interface Props {
  onOpenNote: (id: number) => void;
  onNewNote: () => void;
  onClose: () => void;
}

export default function History({ onOpenNote, onNewNote, onClose }: Props) {
  const t = useT();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiBusyId, setAiBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [tooltipState, setTooltipState] = useState<{
    id: number | null;
    placement: "top" | "bottom";
  }>({ id: null, placement: "top" });

  const refresh = useCallback(async () => {
    try {
      const list = await listNotes();
      setNotes(list);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, refresh]);

  const filtered = notes.filter((note) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      note.title.toLowerCase().includes(q) ||
      stripHtml(note.content).toLowerCase().includes(q)
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
      setError("");
      await refresh();
    } catch (err) {
      setError(`AI: ${getErrorMessage(err)}`);
    } finally {
      setAiBusyId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: t("deleteNote"),
      message: t("deleteConfirm"),
      confirmText: t("delete"),
      cancelText: t("giveUp"),
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteNote(id);
      setError("");
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleTooltipEnter = (e: React.MouseEvent<HTMLDivElement>, id: number) => {
    const itemRect = e.currentTarget.getBoundingClientRect();
    const listRect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!listRect) {
      setTooltipState({ id, placement: "top" });
      return;
    }

    const spaceAbove = itemRect.top - listRect.top;
    const spaceBelow = listRect.bottom - itemRect.bottom;
    const placement = spaceAbove < 150 && spaceBelow > spaceAbove ? "bottom" : "top";
    setTooltipState({ id, placement });
  };

  return (
    <div className="editor-shell">
      <div className="editor-card">
        {error && <ErrorBubble message={error} onClose={() => setError("")} />}

        <div className="editor-titlebar">
          <button onClick={onNewNote} title={t("newNote")}>
            <Plus size={14} />
          </button>
          <div className="title">{t("historyTitle")}</div>
          <button onClick={onClose} title={t("close")}>
            <X size={14} />
          </button>
        </div>

        <div className="history-search">
          <Search size={14} />
          <input
            placeholder={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="history-list">
          {loading && <div className="history-empty">{t("loading")}</div>}

          {!loading && filtered.length === 0 && (
            <div className="history-empty">
              <FileText size={28} />
              <span>{query ? t("noMatch") : t("noNotes")}</span>
            </div>
          )}

          {filtered.map((note) => {
            const rawText = stripHtml(note.content);
            const preview = rawText.slice(0, 80);
            const tooltipText = rawText.slice(0, 180);

            return (
              <div
                key={note.id}
                className="history-item"
                onClick={() => onOpenNote(note.id)}
                onMouseEnter={(e) => handleTooltipEnter(e, note.id)}
                onMouseLeave={() => setTooltipState((prev) => ({ ...prev, id: null }))}
              >
                <div className="history-item-main">
                  <div className="history-item-title">
                    {note.title.trim() || t("untitled")}
                  </div>

                  {preview && <div className="history-item-preview">{preview}</div>}

                  <div className="history-item-date">{formatShortDate(note.updated_at)}</div>
                </div>

                <div className="history-item-actions">
                  <button
                    title={t("aiFix")}
                    disabled={aiBusyId != null}
                    onClick={(e) => void handleAiFix(e, note)}
                    style={{ color: "var(--accent-deep)" }}
                  >
                    {aiBusyId === note.id ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                  </button>

                  <button
                    title={t("edit")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenNote(note.id);
                    }}
                  >
                    <Pencil size={14} />
                  </button>

                  <button
                    title={t("delete")}
                    className="danger"
                    onClick={(e) => void handleDelete(e, note.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div
                  className={`history-tooltip ${
                    tooltipState.id === note.id && tooltipState.placement === "bottom"
                      ? "bottom"
                      : ""
                  }`}
                  aria-hidden="true"
                >
                  <div className="history-tooltip-title">
                    {note.title.trim() || t("untitled")}
                  </div>
                  {tooltipText && <div className="history-tooltip-preview">{tooltipText}</div>}
                  <div className="history-tooltip-meta">
                    <span>{t("createdAt")}: {formatLongDate(note.created_at)}</span>
                    <span>{t("updatedAt")}: {formatLongDate(note.updated_at)}</span>
                    <span>{t("charCount")}: {rawText.length}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
