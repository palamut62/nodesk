use anyhow::{anyhow, Result};
use reqwest::multipart;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct TranscriptionResponse {
    text: String,
}

pub async fn transcribe(audio: Vec<u8>, mime: &str) -> Result<String> {
    let api_key = std::env::var("GROQ_API_KEY")
        .map_err(|_| anyhow!("GROQ_API_KEY .env'de tanımlı değil"))?;
    let model = std::env::var("GROQ_WHISPER_MODEL")
        .unwrap_or_else(|_| "whisper-large-v3".to_string());

    let ext = match mime {
        m if m.contains("webm") => "webm",
        m if m.contains("ogg") => "ogg",
        m if m.contains("mp4") || m.contains("m4a") => "m4a",
        m if m.contains("wav") => "wav",
        _ => "webm",
    };
    let filename = format!("audio.{}", ext);
    let size = audio.len();

    // Debug: son kaydı temp'e yaz, kullanıcı dinleyebilsin
    let dump_path = std::env::temp_dir().join(format!("nodesk_last_audio.{}", ext));
    let _ = std::fs::write(&dump_path, &audio);
    eprintln!(
        "[whisper] {} bytes, mime={}, model={}, dump={}",
        size,
        mime,
        model,
        dump_path.display()
    );

    let part = multipart::Part::bytes(audio)
        .file_name(filename)
        .mime_str(mime)?;

    let form = multipart::Form::new()
        .part("file", part)
        .text("model", model)
        .text("language", "tr")
        .text("response_format", "json");

    let client = reqwest::Client::new();
    let res = client
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await?;

    let status = res.status();
    let body = res.text().await?;
    if !status.is_success() {
        return Err(anyhow!("Groq {}: {}", status, body));
    }
    let parsed: TranscriptionResponse = serde_json::from_str(&body)
        .map_err(|e| anyhow!("parse hata: {} · body: {}", e, body))?;
    let text = parsed.text.trim().to_string();

    eprintln!("[whisper] result: {:?}", text);

    let lower = text.to_lowercase();
    let is_hallucination = (lower.contains("altyaz") && lower.contains("m.k"))
        || lower.contains("abone olmayı unutmayın")
        || lower == "altyazı m.k.";
    if is_hallucination {
        return Err(anyhow!(
            "Mikrofon ses yakalamıyor (Whisper boş kayıttan altyazı uydurdu). \
             Windows ses ayarlarından doğru mikrofonu seç ve ses seviyesini kontrol et."
        ));
    }

    Ok(text)
}
