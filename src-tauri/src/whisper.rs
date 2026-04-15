use anyhow::{anyhow, Result};
use reqwest::multipart;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct TranscriptionResponse {
    text: String,
}

pub async fn transcribe(audio: Vec<u8>, mime: &str, api_key: &str) -> Result<String> {
    if api_key.is_empty() {
        return Err(anyhow!(
            "Groq API key girilmemis. Ayarlar > Groq API Key alanina anahtarini gir. Ucretsiz key icin console.groq.com adresine git."
        ));
    }
    let api_key = api_key.to_string();
    let model =
        std::env::var("GROQ_WHISPER_MODEL").unwrap_or_else(|_| "whisper-large-v3".to_string());

    let ext = match mime {
        m if m.contains("webm") => "webm",
        m if m.contains("ogg") => "ogg",
        m if m.contains("mp4") || m.contains("m4a") => "m4a",
        m if m.contains("wav") => "wav",
        _ => "webm",
    };
    let filename = format!("audio.{ext}");
    let dump_path = std::env::temp_dir().join(format!("nodesk_last_audio.{ext}"));
    let _ = std::fs::write(&dump_path, &audio);

    eprintln!(
        "[whisper] {} bytes, mime={}, model={}, dump={}",
        audio.len(),
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
        return Err(anyhow!(
            "Groq ses transkripsiyon hatasi {}: {}",
            status,
            body
        ));
    }

    let parsed: TranscriptionResponse = serde_json::from_str(&body)
        .map_err(|e| anyhow!("parse hata: {} · body: {}", e, body))?;
    let text = parsed.text.trim().to_string();

    eprintln!("[whisper] result: {:?}", text);

    check_hallucination(&text)?;
    Ok(text)
}

fn check_hallucination(text: &str) -> Result<()> {
    let lower = text.to_lowercase();
    let is_hallucination = (lower.contains("altyaz") && lower.contains("m.k"))
        || lower.contains("abone olmayi unutmayin")
        || lower == "altyazi m.k.";

    if is_hallucination {
        return Err(anyhow!(
            "Mikrofon ses yakalamiyor. Windows ses ayarlarindan dogru mikrofonu sec ve ses seviyesini kontrol et."
        ));
    }

    Ok(())
}
