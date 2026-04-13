use base64::{engine::general_purpose::STANDARD, Engine};
use std::io::Cursor;
use xcap::Monitor;

/// Capture the primary monitor and return a base64-encoded PNG.
pub fn capture_screen() -> anyhow::Result<String> {
    let monitors = Monitor::all()?;
    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| Monitor::all().ok()?.into_iter().next())
        .ok_or_else(|| anyhow::anyhow!("No monitor found"))?;

    let image = monitor.capture_image()?;
    let mut buf = Cursor::new(Vec::new());
    image.write_to(&mut buf, image::ImageFormat::Png)?;
    Ok(STANDARD.encode(buf.into_inner()))
}
