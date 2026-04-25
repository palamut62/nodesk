// Windows.Media.Ocr ile PNG/JPEG bayt dizisinden metin çıkarır.
// Türkçe için sistem dil paketi gerekli (Settings > Time & Language > Language >
// Turkish > Optional features > "Basic typing" / "Optical character recognition").

#[cfg(windows)]
use anyhow::{anyhow, Context, Result};

#[cfg(windows)]
use windows::{
    core::HSTRING,
    Globalization::Language,
    Graphics::Imaging::BitmapDecoder,
    Media::Ocr::OcrEngine,
    Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
};

#[cfg(windows)]
pub fn extract_text(image_bytes: &[u8]) -> Result<String> {
    let engine = create_engine()?;
    // Win OCR'in kabul ettigi max boyut (genelde 2600). Asarsa parsiyel okur.
    let max_dim = OcrEngine::MaxImageDimension().unwrap_or(2600);
    // Kucuk yazida dogruluk icin upscale, ama max_dim'i asma.
    let upscaled = fit_for_ocr(image_bytes, max_dim).unwrap_or_else(|_| image_bytes.to_vec());

    let stream = InMemoryRandomAccessStream::new()?;
    let writer = DataWriter::CreateDataWriter(&stream.GetOutputStreamAt(0)?)?;
    writer.WriteBytes(&upscaled)?;
    writer.StoreAsync()?.get()?;
    writer.FlushAsync()?.get()?;
    writer.DetachStream()?;
    stream.Seek(0)?;

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .context("BitmapDecoder olusturulamadi")?
        .get()?;
    let bitmap = decoder.GetSoftwareBitmapAsync()?.get()?;

    let result = engine.RecognizeAsync(&bitmap)?.get()?;

    // Satir sonlarini koru: Lines() ile gez, her satiri \n ile ayir.
    let lines = result.Lines()?;
    let mut out = String::new();
    for line in lines {
        let s = line.Text()?.to_string();
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&s);
    }
    if out.is_empty() {
        out = result.Text()?.to_string();
    }
    Ok(out)
}

#[cfg(windows)]
fn fit_for_ocr(bytes: &[u8], max_dim: u32) -> Result<Vec<u8>> {
    use image::{imageops::FilterType, ImageFormat};
    use std::io::Cursor;

    let img = image::load_from_memory(bytes)?;
    let (w, h) = (img.width(), img.height());
    let max_side = w.max(h) as f32;
    let limit = max_dim.saturating_sub(8) as f32; // guvenli marj
    // Hedef: kucuk yazida dogruluk icin 2.5x'a kadar buyut, asla limit'i asma.
    // Zaten buyukse, limit'in uzerindeyse kucult.
    let target_scale = if max_side <= 0.0 {
        1.0
    } else if max_side > limit {
        limit / max_side // kucult
    } else {
        let upscale_cap = (limit / max_side).min(2.5);
        upscale_cap.max(1.0)
    };
    if (target_scale - 1.0).abs() < 0.01 {
        return Ok(bytes.to_vec());
    }
    let new_w = ((w as f32) * target_scale).round().max(1.0) as u32;
    let new_h = ((h as f32) * target_scale).round().max(1.0) as u32;
    let resized = img.resize(new_w, new_h, FilterType::Lanczos3);
    let mut buf = Cursor::new(Vec::new());
    resized.write_to(&mut buf, ImageFormat::Png)?;
    Ok(buf.into_inner())
}

#[cfg(windows)]
fn create_engine() -> Result<OcrEngine> {
    if let Ok(lang) = Language::CreateLanguage(&HSTRING::from("tr")) {
        if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&lang) {
            return Ok(engine);
        }
    }
    if let Ok(engine) = OcrEngine::TryCreateFromUserProfileLanguages() {
        return Ok(engine);
    }
    if let Ok(lang) = Language::CreateLanguage(&HSTRING::from("en-US")) {
        if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&lang) {
            return Ok(engine);
        }
    }
    Err(anyhow!(
        "Windows OCR motoru bulunamadi. Settings > Language > 'Optical character recognition' dil paketini yukle."
    ))
}

#[cfg(not(windows))]
pub fn extract_text(_image_bytes: &[u8]) -> anyhow::Result<String> {
    anyhow::bail!("OCR sadece Windows'ta destekleniyor")
}
