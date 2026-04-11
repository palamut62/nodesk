use anyhow::{anyhow, Result};
use serde_json::{json, Value};

const OPENROUTER_API: &str = "https://openrouter.ai/api/v1/chat/completions";

pub async fn fix_text(text: &str, mode: &str, key: &str, model: &str) -> Result<String> {
    if key.is_empty() {
        return Err(anyhow!("OpenRouter API key tanımlı değil (Ayarlar'dan gir)"));
    }

    let system = match mode {
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
