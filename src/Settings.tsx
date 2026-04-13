import { useEffect, useState } from "react";
import { X, Save, Loader2, RefreshCw, Eye, EyeOff } from "lucide-react";
import {
  getSettings,
  saveSettings,
  listModels,
  type Settings as SettingsType,
  type ModelInfo,
} from "./lib/tauri";
import { useT, useLang, type Lang } from "./lib/i18n";

interface Props {
  onClose: () => void;
}

export default function Settings({ onClose }: Props) {
  const t = useT();
  const [lang, setLang] = useLang();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyMasked, setApiKeyMasked] = useState(true);
  const [keyDirty, setKeyDirty] = useState(false);
  const [model, setModel] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [provider, setProvider] = useState<"openrouter" | "ollama">("openrouter");
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434");
  const [ollamaModel, setOllamaModel] = useState("gemma4:31b-cloud");
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
        setProvider((s.ai_provider as any) || "openrouter");
        setOllamaUrl(s.ollama_base_url || "http://127.0.0.1:11434");
        setOllamaModel(s.ollama_model || "gemma4:31b-cloud");
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
    try {
      const list = await listModels();
      setModels(list);
      setStatus(`${list.length} model`);
      setTimeout(() => setStatus(""), 2000);
    } catch (e: any) {
      setStatus(`Model hata: ${e}`);
    } finally {
      setModelsBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setStatus(t("saving"));
    try {
      await saveSettings({
        openrouter_api_key: keyDirty ? apiKey : undefined,
        openrouter_model: model,
        autostart,
        ai_provider: provider,
        ollama_base_url: ollamaUrl,
        ollama_model: ollamaModel,
      });
      setStatus(t("savedNote"));
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
            <div className="title">{t("settingsTitle")}</div>
            <button onClick={onClose} title={t("close")}>
              <X size={14} />
            </button>
          </div>
          <div className="history-empty">{t("loading")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-shell">
      <div className="editor-card">
        <div className="editor-titlebar">
          <div style={{ width: 26 }} />
          <div className="title">{t("settingsTitle")}</div>
          <button onClick={onClose} title={t("close")}>
            <X size={14} />
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-section">
            <label className="settings-label">{t("language")}</label>
            <div className="settings-row">
              <select
                className="settings-input"
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
              >
                <option value="tr">Turkce</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label">{t("aiProvider")}</label>
            <div className="settings-row">
              <select
                className="settings-input"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as any);
                  setModels([]);
                }}
              >
                <option value="openrouter">OpenRouter</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
          </div>

          {provider === "ollama" && (
            <>
              <div className="settings-section">
                <label className="settings-label">{t("serverUrl")}</label>
                <div className="settings-row">
                  <input
                    className="settings-input"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://127.0.0.1:11434"
                  />
                </div>
              </div>
              <div className="settings-section">
                <label className="settings-label">{t("model")}</label>
                <div className="settings-row">
                  {models.length > 0 ? (
                    <select
                      className="settings-input"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                    >
                      {!models.find((m) => m.id === ollamaModel) && ollamaModel && (
                        <option value={ollamaModel}>{ollamaModel}</option>
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
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="gemma4:31b-cloud"
                    />
                  )}
                  <button
                    className="settings-icon-btn"
                    onClick={fetchModels}
                    disabled={modelsBusy}
                    title={t("refreshModels")}
                    type="button"
                  >
                    {modelsBusy ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {provider === "openrouter" && (
          <>
          <div className="settings-section">
            <label className="settings-label">OpenRouter {t("apiKey")}</label>
            <div className="settings-row">
              <input
                className="settings-input"
                type={apiKeyMasked ? "password" : "text"}
                placeholder="sk-or-v1-..."
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
                type="button"
              >
                {apiKeyMasked ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label">{t("model")}</label>
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
                title={t("refreshModels")}
                type="button"
              >
                {modelsBusy ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
              </button>
            </div>
          </div>
          </>
          )}

          <div className="settings-section">
            <label className="settings-check">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostart(e.target.checked)}
              />
              <span>{t("autoStart")}</span>
            </label>
          </div>
        </div>

        <div className="editor-footer">
          <div className="status">{status}</div>
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
