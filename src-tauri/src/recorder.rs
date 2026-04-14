use anyhow::{anyhow, Result};
use image::{imageops, RgbaImage};
use std::fs::File;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use xcap::Monitor;

const MAX_DURATION_SECS: u64 = 300; // 5 dakika

#[derive(Debug, Clone, Copy)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

fn primary_monitor() -> Result<Monitor> {
    let monitors = Monitor::all()?;
    monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| Monitor::all().ok()?.into_iter().next())
        .ok_or_else(|| anyhow!("No monitor found"))
}

fn process_frame(
    frame: RgbaImage,
    region: Option<Region>,
    blur_outside: bool,
    max_width: u32,
) -> RgbaImage {
    let (fw, fh) = frame.dimensions();
    let processed = if let Some(r) = region {
        if blur_outside {
            // Blur full frame, overlay sharp region on top
            let mut blurred = imageops::blur(&frame, 8.0);
            let rx = r.x.max(0) as u32;
            let ry = r.y.max(0) as u32;
            let rw = r.w.min(fw.saturating_sub(rx));
            let rh = r.h.min(fh.saturating_sub(ry));
            if rw > 0 && rh > 0 {
                let sharp = imageops::crop_imm(&frame, rx, ry, rw, rh).to_image();
                imageops::overlay(&mut blurred, &sharp, rx as i64, ry as i64);
            }
            blurred
        } else {
            let rx = r.x.max(0) as u32;
            let ry = r.y.max(0) as u32;
            let rw = r.w.min(fw.saturating_sub(rx));
            let rh = r.h.min(fh.saturating_sub(ry));
            imageops::crop_imm(&frame, rx, ry, rw.max(1), rh.max(1)).to_image()
        }
    } else {
        frame
    };

    let (pw, ph) = processed.dimensions();
    if pw > max_width {
        let new_h = (ph as f32 * max_width as f32 / pw as f32) as u32;
        imageops::resize(&processed, max_width, new_h.max(1), imageops::FilterType::Triangle)
    } else {
        processed
    }
}

pub fn record_gif_with_flag(
    output_path: &str,
    region: Option<Region>,
    fps: u32,
    max_seconds: u64,
    blur_outside: bool,
    stop: Arc<AtomicBool>,
) -> Result<()> {
    let fps = fps.clamp(1, 30);
    let duration = Duration::from_secs(max_seconds.min(MAX_DURATION_SECS));
    let frame_interval = Duration::from_millis(1000 / fps as u64);

    let monitor = primary_monitor()?;

    // Prime one frame to determine output dims
    let first_raw: RgbaImage = monitor.capture_image()?.into();
    let first = process_frame(first_raw, region, blur_outside, 800);
    let (ow, oh) = first.dimensions();

    let file = File::create(output_path)?;
    let mut encoder = gif::Encoder::new(file, ow as u16, oh as u16, &[])?;
    encoder.set_repeat(gif::Repeat::Infinite)?;

    write_gif_frame(&mut encoder, &first, fps)?;

    let start = Instant::now();
    let mut next_tick = Instant::now() + frame_interval;

    while start.elapsed() < duration && !stop.load(Ordering::SeqCst) {
        let now = Instant::now();
        if now < next_tick {
            let wait = next_tick - now;
            // sleep in small slices so stop flag is picked up quickly
            let mut remaining = wait;
            let slice = Duration::from_millis(20);
            while remaining > Duration::ZERO && !stop.load(Ordering::SeqCst) {
                let s = remaining.min(slice);
                std::thread::sleep(s);
                remaining = remaining.saturating_sub(s);
            }
            if stop.load(Ordering::SeqCst) { break; }
        }
        next_tick += frame_interval;

        let raw: RgbaImage = match monitor.capture_image() {
            Ok(img) => img.into(),
            Err(_) => continue,
        };
        if stop.load(Ordering::SeqCst) { break; }
        let frame = process_frame(raw, region, blur_outside, 800);
        // Resize to encoder dims if different
        let frame = if frame.dimensions() != (ow, oh) {
            imageops::resize(&frame, ow, oh, imageops::FilterType::Triangle)
        } else {
            frame
        };
        if let Err(e) = write_gif_frame(&mut encoder, &frame, fps) {
            eprintln!("gif frame error: {e}");
            break;
        }
    }

    Ok(())
}

fn write_gif_frame<W: std::io::Write>(
    encoder: &mut gif::Encoder<W>,
    rgba: &RgbaImage,
    fps: u32,
) -> Result<()> {
    let (w, h) = rgba.dimensions();
    let mut pixels = rgba.as_raw().clone();
    let mut gframe = gif::Frame::from_rgba_speed(w as u16, h as u16, &mut pixels, 10);
    gframe.delay = (100 / fps as u16).max(1);
    encoder.write_frame(&gframe)?;
    Ok(())
}
