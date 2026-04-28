use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

#[derive(Debug, Clone, Copy)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

pub struct FfmpegState(pub Mutex<Option<Child>>);

impl FfmpegState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

pub fn check_ffmpeg() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn start_mp4(
    output_path: &str,
    region: Option<Region>,
    fps: u32,
    max_seconds: u64,
    speed: f32,
    lossless: bool,
) -> Result<Child> {
    let fps = fps.clamp(5, 60);
    let speed = speed.clamp(0.25, 4.0);

    let mut cmd = Command::new("ffmpeg");
    cmd.args([
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-f",
        "gdigrab",
        "-framerate",
        &fps.to_string(),
        "-i",
        "desktop",
        "-t",
        &max_seconds.to_string(),
    ]);

    if let Some(r) = region {
        let x = r.x.max(0);
        let y = r.y.max(0);
        let w = r.w.max(2);
        let h = r.h.max(2);

        let crop_w = format!("min(iw-{x}\\,{w})");
        let crop_h = format!("min(ih-{y}\\,{h})");
        let mut filter_graph = format!(
            "[0:v]split=2[orig][blur];[blur]boxblur=18:2[bg];[orig]crop={crop_w}:{crop_h}:{x}:{y}[fg];[bg][fg]overlay={x}:{y}[mix]"
        );
        let mut map_label = "[mix]".to_string();

        if (speed - 1.0).abs() > f32::EPSILON {
            filter_graph.push_str(&format!(";[mix]setpts=PTS/{:.4}[out]", speed));
            map_label = "[out]".to_string();
        }

        cmd.args(["-filter_complex", &filter_graph, "-map", &map_label]);
    } else if (speed - 1.0).abs() > f32::EPSILON {
        let vf = format!("setpts=PTS/{:.4}", speed);
        cmd.args(["-vf", &vf]);
    }

    if lossless {
        // GIF'e donusum icin ara kaydi kayipsiz tut; cursor kenarlari bulaniklasmasin.
        cmd.args([
            "-c:v",
            "ffv1",
            "-level",
            "3",
            "-g",
            "1",
            "-pix_fmt",
            "bgr0",
            output_path,
        ]);
    } else {
        cmd.args([
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+frag_keyframe+empty_moov+default_base_moof",
            output_path,
        ]);
    }

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    cmd.spawn()
        .map_err(|e| anyhow!("ffmpeg baslatilamadi: {e}"))
}

pub fn graceful_stop(child: &mut Child) -> Result<()> {
    // stdin'i take() ile al ve drop et -> ffmpeg EOF gorur, moov atomunu yazar.
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(b"q\n");
        let _ = stdin.flush();
        drop(stdin);
    }

    // 3 saniyeye kadar graceful cikis bekle
    for _ in 0..30 {
        match child.try_wait() {
            Ok(Some(_)) => return Ok(()),
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(100)),
            Err(_) => break,
        }
    }

    // Zorla sonlandir
    let _ = child.kill();

    // Kill sonrasi max 1 sn bekle, cid'i polle; sonsuz bloklanma yok.
    for _ in 0..20 {
        match child.try_wait() {
            Ok(Some(_)) => return Ok(()),
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
            Err(_) => return Ok(()),
        }
    }

    // Son care: sistem komutuyla oldur (handle kopuksa bile)
    let pid = child.id();
    let _ = Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    Ok(())
}

pub fn mp4_to_gif(
    input: &str,
    output: &str,
    fps: u32,
    max_width: u32,
    speed: f32,
    region: Option<Region>,
) -> Result<()> {
    let fps = fps.clamp(5, 24);
    let speed = speed.clamp(0.25, 4.0);

    let mut chain_parts: Vec<String> = Vec::new();
    if (speed - 1.0).abs() > f32::EPSILON {
        chain_parts.push(format!("setpts=PTS/{:.4}", speed));
    }
    chain_parts.push(format!("fps={fps}"));
    chain_parts.push("setsar=1".to_string());
    if max_width >= 2 {
        chain_parts.push(format!("scale={max_width}:-1:flags=lanczos"));
    }
    let chain = chain_parts.join(",");

    let vf = if let Some(r) = region {
        let x = r.x.max(0);
        let y = r.y.max(0);
        let w = r.w.max(2);
        let h = r.h.max(2);
        let crop_w = format!("min(iw-{x}\\,{w})");
        let crop_h = format!("min(ih-{y}\\,{h})");
        format!(
            "{chain},split=2[all][pal];[pal]crop={crop_w}:{crop_h}:{x}:{y},palettegen=max_colors=256:stats_mode=full[p];[all][p]paletteuse=dither=none"
        )
    } else {
        format!(
            "{chain},split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];[s1][p]paletteuse=dither=none"
        )
    };

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input,
            "-vf",
            &vf,
            "-loop",
            "0",
            output,
        ])
        .status()
        .map_err(|e| anyhow!("ffmpeg calistirilamadi: {e}"))?;

    if !status.success() {
        return Err(anyhow!("ffmpeg GIF donusumu basarisiz"));
    }

    Ok(())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BlurMode {
    Inside,
    Outside,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BlurRegion {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub mode: BlurMode,
    pub strength: Option<u32>,
    pub t_start: Option<f32>,
    pub t_end: Option<f32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AudioTrack {
    pub path: String,
    pub volume: Option<f32>,
    pub replace_original: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Mp4,
    Webm,
    Mov,
    Gif,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EditJob {
    pub input: String,
    pub output: String,
    pub trim_start: Option<f32>,
    pub trim_end: Option<f32>,
    pub blurs: Vec<BlurRegion>,
    pub audio: Option<AudioTrack>,
    pub format: OutputFormat,
}

fn enable_expr(t_start: Option<f32>, t_end: Option<f32>, trim_offset: f32) -> Option<String> {
    match (t_start, t_end) {
        (Some(a), Some(b)) if b > a => {
            let a2 = (a - trim_offset).max(0.0);
            let b2 = (b - trim_offset).max(0.0);
            Some(format!(":enable='between(t,{:.3},{:.3})'", a2, b2))
        }
        _ => None,
    }
}

fn build_blur_filter(blurs: &[BlurRegion], trim_offset: f32) -> String {
    if blurs.is_empty() {
        return String::new();
    }

    // [0:v] tek defa okunabildigi icin once gerekli sayida split yap.
    // 1 base + Inside icin 1 + Outside icin 2 kopya.
    let total_splits: usize = 1 + blurs
        .iter()
        .map(|b| match b.mode {
            BlurMode::Inside => 1,
            BlurMode::Outside => 2,
        })
        .sum::<usize>();

    let mut parts: Vec<String> = Vec::new();
    let split_labels: Vec<String> = (0..total_splits).map(|i| format!("[src{i}]")).collect();
    parts.push(format!(
        "[0:v]split={n}{labels}",
        n = total_splits,
        labels = split_labels.join("")
    ));

    let mut src_iter = split_labels.into_iter();
    let mut cur = src_iter.next().unwrap();

    for (i, b) in blurs.iter().enumerate() {
        let x = b.x.max(0);
        let y = b.y.max(0);
        let w = b.w.max(2);
        let h = b.h.max(2);
        let strength = b.strength.unwrap_or(18).max(2);
        let crop_w = format!("min(iw-{x}\\,{w})");
        let crop_h = format!("min(ih-{y}\\,{h})");
        let en = enable_expr(b.t_start, b.t_end, trim_offset).unwrap_or_default();

        match b.mode {
            BlurMode::Inside => {
                let s1 = src_iter.next().unwrap();
                let bi = format!("[bi{i}]");
                let next = format!("[v{}]", i + 1);
                parts.push(format!(
                    "{s1}boxblur={strength}:2,crop={crop_w}:{crop_h}:{x}:{y}{bi}"
                ));
                parts.push(format!("{cur}{bi}overlay={x}:{y}{en}{next}"));
                cur = next;
            }
            BlurMode::Outside => {
                let s1 = src_iter.next().unwrap();
                let s2 = src_iter.next().unwrap();
                let fb = format!("[fb{i}]");
                let oc = format!("[oc{i}]");
                let mid = format!("[mid{i}]");
                let next = format!("[v{}]", i + 1);
                parts.push(format!("{s1}boxblur={strength}:2{fb}"));
                parts.push(format!(
                    "{s2}crop={crop_w}:{crop_h}:{x}:{y}{oc}"
                ));
                parts.push(format!("{cur}{fb}overlay=0:0{en}{mid}"));
                parts.push(format!("{mid}{oc}overlay={x}:{y}{en}{next}"));
                cur = next;
            }
        }
    }

    parts.push(format!("{cur}null[vout]"));
    parts.join(";")
}

pub fn apply_edit(job: EditJob) -> Result<()> {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y", "-hide_banner", "-loglevel", "warning"]);

    let trim_start = job.trim_start.unwrap_or(0.0).max(0.0);
    let trim_end_opt = job.trim_end.filter(|e| *e > trim_start);

    if trim_start > 0.0 {
        cmd.args(["-ss", &format!("{:.3}", trim_start)]);
    }
    if let Some(e) = trim_end_opt {
        cmd.args(["-to", &format!("{:.3}", e)]);
    }
    cmd.args(["-i", &job.input]);

    let has_audio_track = job.audio.is_some();
    if let Some(a) = &job.audio {
        cmd.args(["-i", &a.path]);
    }

    let blur_filter = build_blur_filter(&job.blurs, trim_start);
    let video_label = if blur_filter.is_empty() { "0:v".to_string() } else { "vout".to_string() };

    // Ses filtresi: extra ses varsa amix veya replace
    let mut audio_filter = String::new();
    let mut audio_label: Option<String> = None;
    if let Some(a) = &job.audio {
        let vol = a.volume.unwrap_or(1.0).max(0.0);
        let replace = a.replace_original.unwrap_or(false);
        if replace {
            audio_filter = format!("[1:a]volume={:.3}[aout]", vol);
            audio_label = Some("aout".into());
        } else {
            audio_filter = format!(
                "[1:a]volume={:.3}[a1];[0:a][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]",
                vol
            );
            audio_label = Some("aout".into());
        }
    }

    let combined_filter = match (blur_filter.is_empty(), audio_filter.is_empty()) {
        (true, true) => String::new(),
        (false, true) => blur_filter.clone(),
        (true, false) => audio_filter.clone(),
        (false, false) => format!("{};{}", blur_filter, audio_filter),
    };

    if !combined_filter.is_empty() {
        cmd.args(["-filter_complex", &combined_filter]);
        cmd.args(["-map", &format!("[{}]", video_label)]);
        if let Some(al) = &audio_label {
            cmd.args(["-map", &format!("[{}]", al)]);
        } else if !has_audio_track {
            // Orijinal ses varsa onu da gec
            cmd.args(["-map", "0:a?"]);
        }
    }

    match job.format {
        OutputFormat::Mp4 | OutputFormat::Mov => {
            cmd.args([
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "20",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "160k",
            ]);
            if matches!(job.format, OutputFormat::Mp4) {
                cmd.args(["-movflags", "+faststart"]);
            }
        }
        OutputFormat::Webm => {
            cmd.args([
                "-c:v", "libvpx-vp9",
                "-b:v", "2M",
                "-deadline", "good",
                "-cpu-used", "4",
                "-pix_fmt", "yuv420p",
                "-c:a", "libopus",
                "-b:a", "128k",
            ]);
        }
        OutputFormat::Gif => {
            let prefix = if blur_filter.is_empty() {
                "[0:v]copy[vout]".to_string()
            } else {
                blur_filter.clone()
            };
            let gif_filter = format!(
                "{};[vout]split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none[vgif]",
                prefix
            );
            return run_gif_export(&job, &gif_filter, trim_start, trim_end_opt);
        }
    }

    cmd.arg(&job.output);
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::piped());

    let output = cmd
        .output()
        .map_err(|e| anyhow!("ffmpeg calistirilamadi: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("ffmpeg duzenleme basarisiz: {}", err.trim()));
    }
    Ok(())
}

pub fn prepare_preview(input: &str, output: &str) -> Result<()> {
    // Tarayicinin oynatamadigi formatlar (wmv/flv/avi/mkv) icin hizli mp4 onizleme uret.
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input,
            "-vf",
            "scale='min(960,iw)':-2",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "28",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            output,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| anyhow!("ffmpeg calistirilamadi: {e}"))?;
    if !status.status.success() {
        let err = String::from_utf8_lossy(&status.stderr);
        return Err(anyhow!("onizleme uretilemedi: {}", err.trim()));
    }
    Ok(())
}

pub fn probe_dimensions(input: &str) -> Result<(u32, u32, f64)> {
    // ffprobe yoksa ffmpeg -i ile parse et. Basit: ffprobe varsayalim.
    let out = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:format=duration",
            "-of",
            "csv=p=0",
            input,
        ])
        .output()
        .map_err(|e| anyhow!("ffprobe calistirilamadi: {e}"))?;
    if !out.status.success() {
        return Err(anyhow!("ffprobe basarisiz"));
    }
    let s = String::from_utf8_lossy(&out.stdout);
    let mut w = 0u32;
    let mut h = 0u32;
    let mut dur = 0f64;
    for line in s.lines() {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 2 {
            if let (Ok(pw), Ok(ph)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                w = pw;
                h = ph;
            } else if let Ok(d) = parts[0].parse::<f64>() {
                dur = d;
            }
        } else if let Ok(d) = line.trim().parse::<f64>() {
            dur = d;
        }
    }
    Ok((w, h, dur))
}

fn run_gif_export(
    job: &EditJob,
    filter: &str,
    trim_start: f32,
    trim_end: Option<f32>,
) -> Result<()> {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y", "-hide_banner", "-loglevel", "warning"]);
    if trim_start > 0.0 {
        cmd.args(["-ss", &format!("{:.3}", trim_start)]);
    }
    if let Some(e) = trim_end {
        cmd.args(["-to", &format!("{:.3}", e)]);
    }
    cmd.args(["-i", &job.input]);
    cmd.args(["-filter_complex", filter, "-map", "[vgif]", "-loop", "0"]);
    cmd.arg(&job.output);
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::piped());
    let out = cmd
        .output()
        .map_err(|e| anyhow!("ffmpeg calistirilamadi: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(anyhow!("gif export basarisiz: {}", err.trim()));
    }
    Ok(())
}
