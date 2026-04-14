import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { confirmDialog } from "./components/Dialog";
import ErrorBubble from "./components/ErrorBubble";
import { sanitizeAiHtml } from "./lib/aiHtml";
import { useT } from "./lib/i18n";
import {
  aiFixText,
  deleteNote,
  getNote,
  listNotes,
  parseTags,
  saveNote,
  tagPastelColor,
  type Note,
} from "./lib/tauri";

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
  const [activeTag, setActiveTag] = useState<string | null>(null);
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

  const allTags = Array.from(
    new Set(notes.flatMap((n) => parseTags(n.tags ?? ""))),
  ).sort();

  const filtered = notes.filter((note) => {
    const tags = parseTags(note.tags ?? "");
    if (activeTag && !tags.includes(activeTag)) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      note.title.toLowerCase().includes(q) ||
      stripHtml(note.content).toLowerCase().includes(q) ||
      tags.some((tg) => tg.toLowerCase().includes(q))
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

        {allTags.length > 0 && (
          <div className="history-tag-filter">
            <button
              className={`tag-filter-chip ${activeTag == null ? "active" : ""}`}
              onClick={() => setActiveTag(null)}
            >
              tümü
            </button>
            {allTags.map((tag) => {
              const c = tagPastelColor(tag);
              const active = activeTag === tag;
              return (
                <button
                  key={tag}
                  className={`tag-filter-chip ${active ? "active" : ""}`}
                  style={{ background: c.bg, color: c.fg }}
                  onClick={() => setActiveTag(active ? null : tag)}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

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

                  {(() => {
                    const tags = parseTags(note.tags ?? "");
                    if (tags.length === 0) return null;
                    return (
                      <div className="history-item-tags">
                        {tags.map((tag) => {
                          const c = tagPastelColor(tag);
                          return (
                            <span
                              key={tag}
                              className="tag-chip small"
                              style={{ background: c.bg, color: c.fg }}
                            >
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}

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

        <div className="social-links">
          <a
            href="https://github.com/umutins62/nodesk"
            target="_blank"
            rel="noreferrer"
            title="GitHub"
            aria-label="GitHub"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.776.42-1.305.763-1.605-2.665-.305-5.467-1.332-5.467-5.93 0-1.31.468-2.38 1.235-3.22-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23A11.5 11.5 0 0 1 12 6.8c1.02.005 2.047.138 3.006.404 2.29-1.552 3.296-1.23 3.296-1.23.654 1.652.243 2.873.12 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.807 5.62-5.48 5.92.43.37.815 1.102.815 2.222 0 1.606-.015 2.9-.015 3.293 0 .32.216.694.825.576C20.565 22.296 24 17.8 24 12.5 24 5.87 18.627.5 12 .5Z" />
            </svg>
          </a>
          <a
            href="https://x.com/umutins62"
            target="_blank"
            rel="noreferrer"
            title="X"
            aria-label="X"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2H21l-6.52 7.45L22 22h-6.828l-4.77-6.24L4.8 22H2.044l6.974-7.97L2 2h6.914l4.314 5.71L18.244 2Zm-1.196 18h1.63L7.03 4H5.29l11.758 16Z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
