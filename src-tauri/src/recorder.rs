use anyhow::{anyhow, Result};
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
