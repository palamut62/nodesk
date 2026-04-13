use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub openrouter_api_key: String,
    #[serde(default = "default_model")]
    pub openrouter_model: String,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default = "default_provider")]
    pub ai_provider: String,
    #[serde(default = "default_ollama_url")]
    pub ollama_base_url: String,
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,
}

fn default_model() -> String {
    "openai/gpt-4o-mini".to_string()
}

fn default_provider() -> String {
    "openrouter".to_string()
}

fn default_ollama_url() -> String {
    "http://127.0.0.1:11434".to_string()
}

fn default_ollama_model() -> String {
    "gemma4:31b-cloud".to_string()
}

pub struct SettingsStore {
    path: PathBuf,
    inner: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> Self {
        let inner = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
            .unwrap_or_else(|| {
                // .env fallback — ilk açılışta env'den al
                Settings {
                    openrouter_api_key: std::env::var("OPENROUTER_API_KEY").unwrap_or_default(),
                    openrouter_model: std::env::var("OPENROUTER_MODEL")
                        .unwrap_or_else(|_| default_model()),
                    autostart: false,
                    ai_provider: std::env::var("AI_PROVIDER").unwrap_or_else(|_| default_provider()),
                    ollama_base_url: std::env::var("OLLAMA_BASE_URL")
                        .unwrap_or_else(|_| default_ollama_url()),
                    ollama_model: std::env::var("OLLAMA_MODEL")
                        .unwrap_or_else(|_| default_ollama_model()),
                }
            });
        Self {
            path,
            inner: Mutex::new(inner),
        }
    }

    pub fn get(&self) -> Settings {
        self.inner.lock().unwrap().clone()
    }

    pub fn save(&self, s: Settings) -> Result<()> {
        let json = serde_json::to_string_pretty(&s)?;
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(&self.path, json)?;
        *self.inner.lock().unwrap() = s;
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
}

pub async fn list_openrouter_models(api_key: &str) -> Result<Vec<ModelInfo>> {
    let client = reqwest::Client::new();
    let mut req = client.get("https://openrouter.ai/api/v1/models");
    if !api_key.is_empty() {
        req = req.bearer_auth(api_key);
    }
    let res = req.send().await?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow::anyhow!("OpenRouter {}: {}", status, text));
    }
    let v: serde_json::Value = serde_json::from_str(&text)?;
    let arr = v
        .get("data")
        .and_then(|d| d.as_array())
        .ok_or_else(|| anyhow::anyhow!("data array bulunamadı"))?;
    let mut out = Vec::with_capacity(arr.len());
    for m in arr {
        let id = m
            .get("id")
            .and_then(|i| i.as_str())
            .unwrap_or("")
            .to_string();
        let name = m
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or(&id)
            .to_string();
        if !id.is_empty() {
            out.push(ModelInfo { id, name });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}
