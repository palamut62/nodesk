import { useState, useEffect } from "react";
import { History, RotateCcw, Trash2, Save, Eye, X } from "lucide-react";
import { saveVersion, listVersions, deleteVersion, type Note, type NoteVersion } from "../lib/tauri";

interface Props {
  note: Note;
  open: boolean;
  onClose: () => void;
  onRestore: (content: string, title: string) => void;
}

function extractText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").slice(0, 200);
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString("tr-TR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function VersionHistoryDialog({ note, open, onClose, onRestore }: Props) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [label, setLabel] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    if (open && note.id) {
      listVersions(note.id).then(setVersions).catch(console.error);
    }
  }, [open, note.id]);

  const previewSnap = previewId ? versions.find(v => v.id === previewId) : null;

  const handleSave = async () => {
    try {
      await saveVersion({
        note_id: note.id,
        title: note.title,
        content: note.content,
        label: label.trim() || undefined,
      });
      const updated = await listVersions(note.id);
      setVersions(updated);
      setLabel("");
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = (v: NoteVersion) => {
    if (window.confirm("Bu sürümü geri yüklemek istiyor musunuz?")) {
      onRestore(v.content, v.title);
      onClose();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteVersion(id);
    setVersions(prev => prev.filter(v => v.id !== id));
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ width: 520, maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <History size={16} />
            <span>Sürüm Geçmişi</span>
          </div>
          <button className="modal-close" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="editor-title-input"
              style={{ flex: 1, margin: 0, fontSize: 12, height: 32, padding: "0 10px" }}
              placeholder="Sürüm etiketi (isteğe bağlı)..."
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
            <button className="btn primary" style={{ height: 32, fontSize: 12 }} onClick={() => void handleSave()}>
              <Save size={13} />
              Kaydet
            </button>
          </div>
        </div>

        {previewSnap && (
          <div style={{ padding: "8px 16px", background: "var(--bg-subtle)", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, opacity: 0.6, textTransform: "uppercase" }}>Önizleme</div>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>{previewSnap.title}</div>
            <div style={{ opacity: 0.6 }}>{extractText(previewSnap.content)}</div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
          {versions.length === 0 ? (
            <div style={{ textAlign: "center", opacity: 0.5, padding: "32px 0", fontSize: 12 }}>
              Henüz sürüm kaydedilmedi. Yukarıdan kaydet butonuna tıklayın.
            </div>
          ) : (
            versions.map((v, i) => (
              <div
                key={v.id}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "10px 12px", marginBottom: 8, borderRadius: 8,
                  border: `1px solid ${previewId === v.id ? "var(--accent)" : "var(--border)"}`,
                  background: previewId === v.id ? "var(--bg-subtle)" : "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>
                      {v.label || `Sürüm ${versions.length - i}`}
                    </span>
                    {i === 0 && (
                      <span style={{ fontSize: 9, background: "var(--accent)", color: "var(--accent-deep)", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
                        Son
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>{fmtDate(v.saved_at)}</div>
                  <div style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.title}</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button className="btn ghost icon-only" title="Önizle" style={{ width: 28, height: 28 }}
                    onClick={() => setPreviewId(previewId === v.id ? null : v.id)}>
                    <Eye size={13} />
                  </button>
                  <button className="btn ghost icon-only" title="Geri Yükle" style={{ width: 28, height: 28 }}
                    onClick={() => handleRestore(v)}>
                    <RotateCcw size={13} />
                  </button>
                  <button className="btn danger icon-only" title="Sil" style={{ width: 28, height: 28 }}
                    onClick={() => void handleDelete(v.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
