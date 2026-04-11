import { useEffect, useState } from "react";
import { X, Save, Loader2, RefreshCw, Eye, EyeOff } from "lucide-react";
import {
  getSettings,
  saveSettings,
  listModels,
  type Settings as SettingsType,
  type ModelInfo,
} from "./lib/tauri";

interface Props {
  onClose: () => void;
}

export default function Settings({ onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyMasked, setApiKeyMasked] = useState(true);
  const [keyDirty, setKeyDirty] = useState(false);
  const [model, setModel] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s: SettingsType = await getSettings();
        setApiKey(s.openrouter_api_key);
        setModel(s.openrouter_model);
        setAutostart(s.autostart);
      } catch (e: any) {
        setStatus(`Hata: ${e}`);
      } finally {
        setLoading(false);
      }
    })();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const fetchModels = async () => {
    setModelsBusy(true);
    setStatus("Modeller çekiliyor…");
    try {
      const list = await listModels();
      setModels(list);
      setStatus(`${list.length} model yüklendi`);
      setTimeout(() => setStatus(""), 2000);
    } catch (e: any) {
      setStatus(`Model hata: ${e}`);
    } finally {
      setModelsBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setStatus("Kaydediliyor…");
    try {
      await saveSettings({
        openrouter_api_key: keyDirty ? apiKey : undefined,
        openrouter_model: model,
        autostart,
      });
      setStatus("Kaydedildi");
      setTimeout(() => onClose(), 500);
    } catch (e: any) {
      setStatus(`Hata: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="editor-shell">
        <div className="editor-card">
          <div className="editor-titlebar">
            <div style={{ width: 26 }} />
            <div className="title">ayarlar</div>
            <button onClick={onClose} title="Kapat">
              <X size={14} />
            </button>
          </div>
          <div className="history-empty">Yükleniyor…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-shell">
      <div className="editor-card">
        <div className="editor-titlebar">
          <div style={{ width: 26 }} />
          <div className="title">ayarlar</div>
          <button onClick={onClose} title="Kapat">
            <X size={14} />
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-section">
            <label className="settings-label">OpenRouter API Key</label>
            <div className="settings-row">
              <input
                className="settings-input"
                type={apiKeyMasked ? "password" : "text"}
                placeholder="sk-or-v1-…"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setKeyDirty(true);
                }}
                onFocus={() => {
                  if (!keyDirty && apiKey.startsWith("••")) {
                    setApiKey("");
                    setKeyDirty(true);
                  }
                }}
              />
              <button
                className="settings-icon-btn"
                onClick={() => setApiKeyMasked((v) => !v)}
                title={apiKeyMasked ? "Göster" : "Gizle"}
                type="button"
              >
                {apiKeyMasked ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
            <div className="settings-hint">
              openrouter.ai/keys — nodesk anahtarı yerel olarak saklar
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label">Model</label>
            <div className="settings-row">
              {models.length > 0 ? (
                <select
                  className="settings-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {!models.find((m) => m.id === model) && model && (
                    <option value={model}>{model}</option>
                  )}
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="settings-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="openai/gpt-4o-mini"
                />
              )}
              <button
                className="settings-icon-btn"
                onClick={fetchModels}
                disabled={modelsBusy}
                title="Modelleri çek"
                type="button"
              >
                {modelsBusy ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
              </button>
            </div>
            <div className="settings-hint">
              AI düzelt bu model üzerinden çalışır
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-check">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostart(e.target.checked)}
              />
              <span>Bilgisayar açılınca otomatik başlat</span>
            </label>
          </div>
        </div>

        <div className="editor-footer">
          <div className="status">{status || "Esc iptal · Kaydet ile uygula"}</div>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
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
