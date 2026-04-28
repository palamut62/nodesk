import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, RefreshCw, Save, X } from "lucide-react";
import ErrorBubble from "./components/ErrorBubble";
import WindowControls from "./components/WindowControls";
import { useLang, useT, type Lang } from "./lib/i18n";
import {
  applyDock,
  applyFloating,
  getSettings,
  listModels,
  saveSettings,
  type BarMode,
  type DockEdge,
  type ModelInfo,
  type Settings as SettingsType,
} from "./lib/tauri";

function getErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value ?? "Bilinmeyen hata");
}

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
  const [groqKey, setGroqKey] = useState("");
  const [groqKeyMasked, setGroqKeyMasked] = useState(true);
  const [groqKeyDirty, setGroqKeyDirty] = useState(false);
  const [model, setModel] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [barMode, setBarMode] = useState<BarMode>("floating");
  const [dockEdge, setDockEdge] = useState<DockEdge>("right");
  const [provider, setProvider] = useState<"openrouter" | "ollama" | "nvidia">("openrouter");
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434");
  const [ollamaModel, setOllamaModel] = useState("gemma4:31b-cloud");
  const [nvidiaKey, setNvidiaKey] = useState("");
  const [nvidiaKeyMasked, setNvidiaKeyMasked] = useState(true);
  const [nvidiaKeyDirty, setNvidiaKeyDirty] = useState(false);
  const [nvidiaModel, setNvidiaModel] = useState("deepseek-ai/deepseek-v4-flash");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const settings: SettingsType = await getSettings();
        setApiKey(settings.openrouter_api_key);
        setModel(settings.openrouter_model);
        setGroqKey(settings.groq_api_key ?? "");
        setAutostart(settings.autostart);
        setBarMode((settings.bar_mode as BarMode) || "floating");
        setDockEdge((settings.dock_edge as DockEdge) || "right");
        setProvider((settings.ai_provider as "openrouter" | "ollama" | "nvidia") || "openrouter");
        setOllamaUrl(settings.ollama_base_url || "http://127.0.0.1:11434");
        setOllamaModel(settings.ollama_model || "gemma4:31b-cloud");
        setNvidiaKey(settings.nvidia_api_key ?? "");
        setNvidiaModel(settings.nvidia_model || "deepseek-ai/deepseek-v4-flash");
        setError("");
      } catch (err) {
        setError(getErrorMessage(err));
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
      setError("");
      setStatus(`${list.length} model`);
      window.setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      setError(getErrorMessage(err));
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
        groq_api_key: groqKeyDirty ? groqKey : undefined,
        autostart,
        ai_provider: provider,
        ollama_base_url: ollamaUrl,
        ollama_model: ollamaModel,
        nvidia_api_key: nvidiaKeyDirty ? nvidiaKey : undefined,
        nvidia_model: nvidiaModel,
        bar_mode: barMode,
        dock_edge: dockEdge,
      });
      try {
        window.localStorage.setItem("nodesk-bar-mode", barMode);
        window.localStorage.setItem("nodesk-dock-edge", dockEdge);
      } catch {}
      window.dispatchEvent(
        new CustomEvent("nodesk-bar-config", { detail: { barMode, dockEdge } }),
      );
      if (barMode === "docked") {
        await applyDock(dockEdge, false);
      } else {
        await applyFloating();
      }
      setError("");
      setStatus(t("savedNote"));
      window.setTimeout(() => onClose(), 500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="editor-shell">
        <div className="editor-card">
          <div className="editor-titlebar">
            <div style={{ width: 78 }} />
            <div className="title">{t("settingsTitle")}</div>
            <WindowControls />
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
        {error && <ErrorBubble message={error} onClose={() => setError("")} />}

        <div className="editor-titlebar">
          <div style={{ width: 78 }} />
          <div className="title">{t("settingsTitle")}</div>
          <WindowControls />
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
                  setProvider(e.target.value as "openrouter" | "ollama" | "nvidia");
                  setModels([]);
                }}
              >
                <option value="openrouter">OpenRouter</option>
                <option value="ollama">Ollama</option>
                <option value="nvidia">NVIDIA</option>
              </select>
            </div>
            <div className="settings-hint">{t("voiceTranscriptionHint")}</div>
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
                      {!models.find((item) => item.id === ollamaModel) && ollamaModel && (
                        <option value={ollamaModel}>{ollamaModel}</option>
                      )}
                      {models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
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
                    onClick={() => void fetchModels()}
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
                      if (!keyDirty && apiKey.startsWith("****")) {
                        setApiKey("");
                        setKeyDirty(true);
                      }
                    }}
                  />
                  <button
                    className="settings-icon-btn"
                    onClick={() => setApiKeyMasked((value) => !value)}
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
                      {!models.find((item) => item.id === model) && model && (
                        <option value={model}>{model}</option>
                      )}
                      {models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
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
                    onClick={() => void fetchModels()}
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

          {provider === "nvidia" && (
            <>
              <div className="settings-section">
                <label className="settings-label">NVIDIA {t("apiKey")}</label>
                <div className="settings-row">
                  <input
                    className="settings-input"
                    type={nvidiaKeyMasked ? "password" : "text"}
                    placeholder="nvapi-..."
                    value={nvidiaKey}
                    onChange={(e) => {
                      setNvidiaKey(e.target.value);
                      setNvidiaKeyDirty(true);
                    }}
                    onFocus={() => {
                      if (!nvidiaKeyDirty && nvidiaKey.startsWith("****")) {
                        setNvidiaKey("");
                        setNvidiaKeyDirty(true);
                      }
                    }}
                  />
                  <button
                    className="settings-icon-btn"
                    onClick={() => setNvidiaKeyMasked((v) => !v)}
                    type="button"
                  >
                    {nvidiaKeyMasked ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
                <div className="settings-hint">build.nvidia.com — integrate.api.nvidia.com</div>
              </div>

              <div className="settings-section">
                <label className="settings-label">{t("model")}</label>
                <div className="settings-row">
                  {models.length > 0 ? (
                    <select
                      className="settings-input"
                      value={nvidiaModel}
                      onChange={(e) => setNvidiaModel(e.target.value)}
                    >
                      {!models.find((item) => item.id === nvidiaModel) && nvidiaModel && (
                        <option value={nvidiaModel}>{nvidiaModel}</option>
                      )}
                      {models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="settings-input"
                      value={nvidiaModel}
                      onChange={(e) => setNvidiaModel(e.target.value)}
                      placeholder="deepseek-ai/deepseek-v4-flash"
                    />
                  )}
                  <button
                    className="settings-icon-btn"
                    onClick={() => void fetchModels()}
                    disabled={modelsBusy}
                    title={t("refreshModels")}
                    type="button"
                  >
                    {modelsBusy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="settings-section">
            <label className="settings-label">Groq API Key <span style={{ fontWeight: 400, opacity: 0.6 }}>(sesli not)</span></label>
            <div className="settings-row">
              <input
                className="settings-input"
                type={groqKeyMasked ? "password" : "text"}
                placeholder="gsk_..."
                value={groqKey}
                onChange={(e) => {
                  setGroqKey(e.target.value);
                  setGroqKeyDirty(true);
                }}
                onFocus={() => {
                  if (!groqKeyDirty && groqKey.startsWith("****")) {
                    setGroqKey("");
                    setGroqKeyDirty(true);
                  }
                }}
              />
              <button
                className="settings-icon-btn"
                onClick={() => setGroqKeyMasked((v) => !v)}
                type="button"
              >
                {groqKeyMasked ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
            <div className="settings-hint">console.groq.com — ucretsiz, Whisper icin</div>
          </div>

          <div className="settings-section">
            <label className="settings-label">{t("barMode")}</label>
            <div className="settings-row">
              <select
                className="settings-input"
                value={barMode}
                onChange={(e) => setBarMode(e.target.value as BarMode)}
              >
                <option value="floating">{t("barModeFloating")}</option>
                <option value="docked">{t("barModeDocked")}</option>
              </select>
            </div>
            {barMode === "docked" && (
              <div className="settings-row" style={{ marginTop: 8 }}>
                <select
                  className="settings-input"
                  value={dockEdge}
                  onChange={(e) => setDockEdge(e.target.value as DockEdge)}
                >
                  <option value="right">{t("edgeRight")}</option>
                  <option value="left">{t("edgeLeft")}</option>
                  <option value="bottom">{t("edgeBottom")}</option>
                </select>
              </div>
            )}
          </div>

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
          <button className="btn primary" onClick={() => void handleSave()} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
