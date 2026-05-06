import { useState } from "react";
import { Lock, Unlock, Eye, EyeOff, X } from "lucide-react";
import { encryptText, decryptText } from "../lib/crypto";
import { updateNoteMeta, type Note } from "../lib/tauri";

interface Props {
  note: Note;
  open: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Note>) => void;
}

export function NoteEncryptDialog({ note, open, onClose, onUpdate }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleLock = async () => {
    if (!password) return;
    if (password !== confirm) { setError("Şifreler eşleşmiyor."); return; }
    setLoading(true);
    setError("");
    try {
      const encrypted = await encryptText(note.content, password);
      await updateNoteMeta({ id: note.id, encrypted: true, encrypted_content: encrypted });
      onUpdate({ encrypted: true, encrypted_content: encrypted, content: "" });
      setPassword(""); setConfirm("");
      onClose();
    } catch {
      setError("Şifreleme başarısız.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!password || !note.encrypted_content) return;
    setLoading(true);
    setError("");
    try {
      const decrypted = await decryptText(note.encrypted_content, password);
      await updateNoteMeta({ id: note.id, encrypted: false, encrypted_content: null });
      onUpdate({ encrypted: false, encrypted_content: null, content: decrypted });
      setPassword("");
      onClose();
    } catch {
      setError("Yanlış şifre.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {note.encrypted ? <Unlock size={16} style={{ color: "#f59e0b" }} /> : <Lock size={16} />}
            <span>{note.encrypted ? "Notu Çöz" : "Notu Şifrele"}</span>
          </div>
          <button className="modal-close" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
            {note.encrypted
              ? "Notu açmak için şifreyi girin."
              : "Not AES-256 ile şifrelenecek. Şifreyi unutursanız not kurtarılamaz."}
          </p>

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              className="editor-tags-input"
              style={{ width: "100%", boxSizing: "border-box", paddingRight: 36 }}
              placeholder="Şifre..."
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (note.encrypted ? void handleUnlock() : confirm ? void handleLock() : undefined)}
            />
            <button
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}
              onClick={() => setShowPassword(v => !v)}
              type="button"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {!note.encrypted && (
            <input
              type={showPassword ? "text" : "password"}
              className="editor-tags-input"
              style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="Şifreyi onayla..."
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && void handleLock()}
            />
          )}

          {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}

          <button
            className="btn primary"
            style={{ width: "100%" }}
            onClick={() => void (note.encrypted ? handleUnlock() : handleLock())}
            disabled={!password || loading || (!note.encrypted && !confirm)}
          >
            {loading ? "..." : note.encrypted ? <><Unlock size={13} /> Şifreyi Çöz</> : <><Lock size={13} /> Şifrele</>}
          </button>
        </div>
      </div>
    </div>
  );
}
