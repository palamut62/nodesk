use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use crate::settings::ModelInfo;

fn system_prompt(mode: &str) -> &'static str {
    match mode {
        "shorten" => "Verilen Türkçe metni anlamını koruyarak kısalt. Sadece düzenlenmiş metni döndür, açıklama yapma.",
        "expand" => "Verilen Türkçe metni aynı dilde, aynı üslupla genişlet ve detaylandır. Sadece metni döndür.",
        "format" => "Verilen metni markdown başlıkları, listeler ve to-do'larla güzel biçimlendir. Sadece markdown döndür.",
        _ => "Türkçe bir notu hem yazım/dilbilgisi/noktalama olarak düzelt hem de okunabilir biçimde yapılandır. Kurallar:\n\
- Anlamı, üslubu ve içeriği değiştirme; hiçbir şey ekleme veya çıkarma.\n\
- Metin tek bir düşünce/paragrafsa sadece düzeltilmiş paragraf(lar) olarak döndür.\n\
- Birden çok madde, görev, fikir, adım veya yapılacak varsa uygun biçimde yapılandır:\n\
  · Yapılacaklar/aksiyonlar için TipTap task list: <ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"false\"><p>madde</p></li></ul>\n\
  · Sıralı adımlar için <ol><li>…</li></ol>\n\
  · Bağımsız maddeler için <ul><li>…</li></ul>\n\
  · Gerekirse <h2>/<h3> başlıklarıyla gruplandır.\n\
- Çıktı SADECE geçerli HTML olmalı: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <br>. Kod bloğu, markdown, ``` veya açıklama KULLANMA.\n\
- Cevapta sadece HTML olsun, başka hiçbir metin olmasın.",
    }
}

pub async fn fix_text(text: &str, mode: &str, base_url: &str, model: &str) -> Result<String> {
    let url = format!("{}/api/chat", base_url.trim_end_matches('/'));
    let body = json!({
        "model": model,
        "stream": false,
        "options": { "temperature": 0.3 },
        "messages": [
            { "role": "system", "content": system_prompt(mode) },
            { "role": "user", "content": text }
        ]
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()?;
    let res = client.post(&url).json(&body).send().await?;
    let status = res.status();
    let txt = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("Ollama hata {}: {}", status, txt));
    }
    let v: Value = serde_json::from_str(&txt)?;
    let content = v
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or_else(|| anyhow!("Ollama cevabı parse edilemedi: {}", txt))?;
    Ok(content.trim().to_string())
}

pub async fn list_models(base_url: &str) -> Result<Vec<ModelInfo>> {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let res = client.get(&url).send().await?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("Ollama {}: {}", status, text));
    }
    let v: Value = serde_json::from_str(&text)?;
    let arr = v
        .get("models")
        .and_then(|d| d.as_array())
        .ok_or_else(|| anyhow!("models array bulunamadı"))?;
    let mut out = Vec::with_capacity(arr.len());
    for m in arr {
        let id = m
            .get("name")
            .and_then(|i| i.as_str())
            .unwrap_or("")
            .to_string();
        if !id.is_empty() {
            out.push(ModelInfo {
                id: id.clone(),
                name: id,
            });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}
