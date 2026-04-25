import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Pin, PinOff, Copy, Trash2, X, Check, Clipboard as ClipIcon } from "lucide-react";
import WindowControls from "./components/WindowControls";
import {
  copyClip,
  deleteClip,
  listClipboard,
  toggleClipPin,
  type ClipItem,
} from "./lib/tauri";

interface Props {
  onClose: () => void;
}

export default function ClipboardPanel({ onClose }: Props) {
  const [items, setItems] = useState<ClipItem[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await listClipboard());
    } catch (e) {
      console.error("[clipboard] list err", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const un = listen("clipboard-changed", () => refresh());
    return () => {
      un.then((f) => f());
    };
  }, [refresh]);

  const fmtTs = (ts: number) => {
    const d = new Date(ts * 1000);
    const today = new Date();
    const sameDay =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    return sameDay
      ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  };

  const handleCopy = async (id: number) => {
    try {
      await copyClip(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId((v) => (v === id ? null : v)), 1200);
    } catch (e) {
      console.error("[clipboard] copy err", e);
    }
  };

  const handlePin = async (id: number) => {
    await toggleClipPin(id);
    refresh();
  };

  const handleDelete = async (id: number) => {
    await deleteClip(id);
    refresh();
  };

  return (
    <div className="editor-shell">
      <div className="editor-card">
        <div className="editor-titlebar">
          <div style={{ width: 78 }} />
          <div className="title">Pano · Son kopyalananlar</div>
          <WindowControls />
          <button onClick={onClose} title="Kapat"><X size={14} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {items.length === 0 && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: 40, color: "#888", gap: 8,
              fontSize: 13,
            }}>
              <ClipIcon size={28} />
              <div>Henüz kopyalanan metin yok.</div>
              <div style={{ fontSize: 11 }}>Bir şey kopyalayınca burada görünecek.</div>
            </div>
          )}
          {items.map((it) => (
            <div
              key={it.id}
              className="clip-row"
              style={{
                display: "flex", gap: 8, padding: "6px 10px", marginBottom: 5,
                background: it.pinned ? "rgba(255, 213, 79, 0.12)" : "#fafafa",
                border: `1px solid ${it.pinned ? "#f1c44a" : "#e5e5ea"}`,
                borderRadius: 8, alignItems: "center",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, lineHeight: 1.35, color: "#222",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {it.text.replace(/\s+/g, " ")}
                </div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                  {fmtTs(it.ts)} · {it.text.length} kr
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "row", gap: 2, flexShrink: 0 }}>
                <button
                  title={it.pinned ? "Pini kaldır" : "Pinle"}
                  onClick={() => void handlePin(it.id)}
                  style={iconBtn(it.pinned ? "#f1a500" : "#666")}
                >
                  {it.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
                <button
                  title="Kopyala"
                  onClick={() => void handleCopy(it.id)}
                  style={iconBtn(copiedId === it.id ? "#43a047" : "#1e88e5")}
                >
                  {copiedId === it.id ? <Check size={13} /> : <Copy size={13} />}
                </button>
                <button
                  title="Sil"
                  onClick={() => void handleDelete(it.id)}
                  style={iconBtn("#e53935")}
                  disabled={it.pinned}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="editor-footer" style={{ borderTop: "1px solid #eee" }}>
          <div className="status">
            {items.filter((i) => i.pinned).length} pinli · {items.filter((i) => !i.pinned).length}/10 son
          </div>
          <button className="btn ghost" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}

function iconBtn(color: string): React.CSSProperties {
  return {
    width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "1px solid transparent", borderRadius: 6,
    color, cursor: "pointer", padding: 0,
  };
}
