use anyhow::{anyhow, Result};
use serde_json::{json, Value};

const OPENROUTER_API: &str = "https://openrouter.ai/api/v1/chat/completions";

pub async fn fix_text(text: &str, mode: &str) -> Result<String> {
    let key = std::env::var("OPENROUTER_API_KEY")
        .map_err(|_| anyhow!("OPENROUTER_API_KEY .env dosyasında tanımlı değil"))?;
    let model = std::env::var("OPENROUTER_MODEL")
        .unwrap_or_else(|_| "openai/gpt-4o-mini".to_string());

    let system = match mode {
        "shorten" => "Verilen Türkçe metni anlamını koruyarak kısalt. Sadece düzenlenmiş metni döndür, açıklama yapma.",
        "expand" => "Verilen Türkçe metni aynı dilde, aynı üslupla genişlet ve detaylandır. Sadece metni döndür.",
        "format" => "Verilen metni markdown başlıkları, listeler ve to-do'larla güzel biçimlendir. Sadece markdown döndür.",
        _ => "Verilen Türkçe metnin yazım, dilbilgisi ve noktalama hatalarını düzelt. Anlamı değiştirme, üslubu koru. Sadece düzeltilmiş metni döndür, açıklama yapma.",
    };

    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": text }
        ],
        "temperature": 0.3
    });

    let client = reqwest::Client::new();
    let res = client
        .post(OPENROUTER_API)
        .bearer_auth(key)
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://github.com/umuti/nodesk")
        .header("X-Title", "nodesk")
        .json(&body)
        .send()
        .await?;

    let status = res.status();
    let txt = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("OpenRouter hata {}: {}", status, txt));
    }
    let v: Value = serde_json::from_str(&txt)?;
    let content = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or_else(|| anyhow!("OpenRouter cevabı parse edilemedi: {}", txt))?;
    Ok(content.trim().to_string())
}
