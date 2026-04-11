import { invoke } from "@tauri-apps/api/core";
import {
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  LogicalPosition,
} from "@tauri-apps/api/window";

export interface AppConfig {
  openrouter_configured: boolean;
  openrouter_model: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
}

export const getConfig = () => invoke<AppConfig>("get_config");

export interface Settings {
  openrouter_api_key: string;
  openrouter_model: string;
  autostart: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
}

export const getSettings = () => invoke<Settings>("get_settings");

export const saveSettings = (payload: {
  openrouter_api_key?: string;
  openrouter_model?: string;
  autostart?: boolean;
}) => invoke<void>("save_settings", { payload });

export const listModels = () => invoke<ModelInfo[]>("list_models");

export const hideToTray = () => invoke<void>("hide_to_tray");

export const saveNote = (id: number | null, title: string, content: string) =>
  invoke<number>("save_note", { payload: { id, title, content } });

export const listNotes = () => invoke<Note[]>("list_notes");
export const getNote = (id: number) => invoke<Note>("get_note", { id });
export const deleteNote = (id: number) => invoke<void>("delete_note", { id });

export const aiFixText = (
  text: string,
  mode: "fix" | "shorten" | "expand" | "format" = "fix",
) => invoke<string>("ai_fix_text", { payload: { text, mode } });

export async function transcribeAudio(
  blob: Blob,
  mime?: string,
): Promise<string> {
  const buf = await blob.arrayBuffer();
  const audio = Array.from(new Uint8Array(buf));
  return invoke<string>("transcribe_audio", {
    payload: { audio, mime: mime ?? blob.type ?? "audio/webm" },
  });
}

// ============ LIVE WHISPER STREAMING ============
// MediaRecorder + her N saniyede biriken sesi Groq'a gönderme.
// WebView2'de Web Speech API çalışmadığı için bu yöntem kullanılıyor.

export interface LiveWhisperSession {
  stop: () => Promise<string>;
  cancel: () => void;
  getDebug: () => string;
  getPeakLevel: () => number; // 0..1
}

export async function startLiveWhisper(opts: {
  onPartial?: (text: string) => void;
  onDebug?: (msg: string) => void;
  onLevel?: (level: number) => void; // 0..1 anlık ses seviyesi
  intervalMs?: number;
}): Promise<LiveWhisperSession> {
  const interval = opts.intervalMs ?? 3500;
  const dbg = (m: string) => {
    console.log("[live-whisper]", m);
    opts.onDebug?.(m);
  };

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Mikrofon API desteklenmiyor");
  }
  dbg("getUserMedia iste");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const track = stream.getAudioTracks()[0];
  dbg(`mic OK: ${track?.label || "bilinmeyen"}`);

  // Ses seviyesi ölçer (mic gerçekten çalışıyor mu görmek için)
  let peak = 0;
  let levelTimer: number | null = null;
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ac = new AC();
    const src = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    levelTimer = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let max = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128) / 128;
        if (v > max) max = v;
      }
      if (max > peak) peak = max;
      opts.onLevel?.(max);
    }, 100);
  } catch (e) {
    dbg(`audio analyser err: ${e}`);
  }

  const mimeCandidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "",
  ];
  const mime = mimeCandidates.find(
    (m) => !m || MediaRecorder.isTypeSupported(m),
  ) ?? "";
  dbg(`mime=${mime || "default"}`);

  const rec = mime
    ? new MediaRecorder(stream, { mimeType: mime })
    : new MediaRecorder(stream);

  const chunks: Blob[] = [];
  let totalBytes = 0;
  let latestText = "";
  let lastError = "";
  let inFlight = 0;
  let stopped = false;
  let resolver: ((v: string) => void) | null = null;
  let stopPromise: Promise<string> | null = null;

  const cleanup = () => {
    if (levelTimer != null) {
      window.clearInterval(levelTimer);
      levelTimer = null;
    }
    stream.getTracks().forEach((t) => t.stop());
  };

  const uploadCurrent = async (tag: number) => {
    if (chunks.length === 0) {
      dbg("upload skip: chunk yok");
      return;
    }
    inFlight = tag;
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    dbg(`upload #${tag} size=${blob.size}`);
    if (blob.size < 200) return;
    try {
      const text = await transcribeAudio(blob, blob.type);
      dbg(`upload #${tag} result=${text.slice(0, 40)}`);
      if (tag !== inFlight && !stopped) return;
      const trimmed = text.trim();
      if (trimmed) {
        latestText = trimmed;
        opts.onPartial?.(latestText);
      }
    } catch (e: any) {
      lastError = String(e?.message || e).slice(0, 80);
      dbg(`upload err: ${lastError}`);
    }
  };

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
      totalBytes += e.data.size;
      dbg(`chunk ${e.data.size}b (total ${totalBytes})`);
    }
  };
  rec.onstop = async () => {
    dbg("onstop");
    cleanup();
    try {
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      dbg(`final upload size=${blob.size}`);
      if (blob.size >= 200) {
        const text = await transcribeAudio(blob, blob.type);
        dbg(`final result=${text.slice(0, 60)}`);
        if (text.trim()) latestText = text.trim();
      } else {
        lastError = `çok kısa (${blob.size}b)`;
      }
    } catch (e: any) {
      lastError = String(e?.message || e).slice(0, 80);
      dbg(`final err: ${lastError}`);
    }
    if (!latestText && lastError) latestText = `[HATA] ${lastError}`;
    resolver?.(latestText);
  };
  rec.onerror = (e: any) => {
    lastError = `recorder err: ${e?.error?.message || e}`;
    dbg(lastError);
  };

  rec.start(1000);
  dbg("rec.start(1000)");

  let tick = 0;
  const timer = window.setInterval(() => {
    if (stopped) return;
    tick++;
    void uploadCurrent(tick);
  }, interval);

  return {
    stop: () => {
      if (stopPromise) return stopPromise;
      stopped = true;
      window.clearInterval(timer);
      stopPromise = new Promise<string>((res) => {
        resolver = res;
        try {
          rec.requestData?.();
        } catch {}
        try {
          rec.stop();
        } catch {
          cleanup();
          res(latestText || (lastError ? `[HATA] ${lastError}` : ""));
        }
      });
      return stopPromise;
    },
    cancel: () => {
      stopped = true;
      window.clearInterval(timer);
      try {
        rec.stop();
      } catch {}
      cleanup();
    },
    getDebug: () =>
      `total=${totalBytes}b peak=${(peak * 100).toFixed(0)}% err=${lastError || "—"}`,
    getPeakLevel: () => peak,
  };
}

// ============ WEB SPEECH API (Tarayıcı yerleşik, key gerekmez) ============
// WebView2 / Edge Türkçe dahil çoğu dili destekler. Anında çalışır.

type SR = any;

export interface SpeechSession {
  stop: () => Promise<string>;
  cancel: () => void;
}

export function startSpeech(opts?: {
  lang?: string;
  onPartial?: (text: string) => void;
}): SpeechSession {
  const W = window as any;
  const Ctor: SR = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!Ctor) {
    throw new Error("Tarayıcı SpeechRecognition desteklemiyor");
  }
  const rec = new Ctor();
  rec.lang = opts?.lang ?? "tr-TR";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  let lastInterim = "";
  let resolved = false;
  let resolver: ((v: string) => void) | null = null;
  let rejecter: ((e: any) => void) | null = null;
  let stopping = false;
  let autoRestart = true;

  const combine = () => (finalText + " " + lastInterim).trim().replace(/\s+/g, " ");

  rec.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        finalText += r[0].transcript + " ";
      } else {
        interim += r[0].transcript;
      }
    }
    lastInterim = interim;
    opts?.onPartial?.(combine());
  };
  rec.onerror = (e: any) => {
    console.warn("[speech] error", e.error);
    if (e.error === "no-speech" || e.error === "aborted") return;
    if (resolved) return;
    if (!stopping) return; // engelle, sadece stop sırasında reject
    resolved = true;
    rejecter?.(new Error(`Speech hata: ${e.error || "bilinmeyen"}`));
  };
  rec.onend = () => {
    // continuous=true bile bazen kendiliğinden biter; stop edilmediyse yeniden başlat
    if (!stopping && autoRestart) {
      try {
        rec.start();
        return;
      } catch (err) {
        console.warn("[speech] restart fail", err);
      }
    }
    if (resolved) return;
    // İnterim varsa onu da finale ekle (stop ile interim promote olmuyor)
    if (lastInterim) {
      finalText += lastInterim + " ";
      lastInterim = "";
    }
    resolved = true;
    resolver?.(finalText.trim());
  };

  rec.start();

  return {
    stop: () =>
      new Promise<string>((res, rej) => {
        stopping = true;
        autoRestart = false;
        if (resolved) return res(finalText.trim());
        resolver = res;
        rejecter = rej;
        // İnterim'i hemen finale al — stop sonrası kaybolmasın
        if (lastInterim) {
          finalText += lastInterim + " ";
          lastInterim = "";
        }
        try {
          rec.stop();
        } catch {
          if (!resolved) {
            resolved = true;
            res(finalText.trim());
          }
        }
        // Güvenlik: 1.5s içinde onend gelmezse zorla resolve
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try {
              rec.abort();
            } catch {}
            res(finalText.trim());
          }
        }, 1500);
      }),
    cancel: () => {
      stopping = true;
      autoRestart = false;
      resolved = true;
      try {
        rec.abort();
      } catch {}
    },
  };
}

export const startDrag = () => invoke<void>("start_drag");
export const quitApp = () => invoke<void>("quit_app");

// ============ MORPH / WINDOW ============

export type ViewKind = "pill" | "editor" | "history" | "settings";

export const VIEW_SIZES: Record<ViewKind, { w: number; h: number }> = {
  pill: { w: 310, h: 56 },
  editor: { w: 700, h: 600 },
  history: { w: 460, h: 600 },
  settings: { w: 460, h: 520 },
};

export async function setAlwaysOnTop(value: boolean) {
  try {
    await getCurrentWindow().setAlwaysOnTop(value);
  } catch {}
}

export async function focusWindow() {
  try {
    await getCurrentWindow().setFocus();
  } catch {}
}

/**
 * OS penceresini tek seferde boyutlandırır. Ekran dışına taşarsa konum shift'i
 * yapar. Animasyon yok — akıcı geçiş CSS ile içerideki frame'de yapılır.
 */
export async function setWindowBox(w: number, h: number): Promise<void> {
  const win = getCurrentWindow();
  try {
    const scale = await win.scaleFactor();
    const pos = await win.outerPosition();
    const startX = pos.x / scale;
    const startY = pos.y / scale;

    let monW = 1920;
    let monH = 1080;
    try {
      const mon = await currentMonitor();
      if (mon) {
        monW = mon.size.width / mon.scaleFactor;
        monH = mon.size.height / mon.scaleFactor;
      }
    } catch {}

    let x = startX;
    let y = startY;
    if (x + w > monW) x = Math.max(0, monW - w - 8);
    if (y + h > monH) y = Math.max(0, monH - h - 8);

    if (Math.round(x) !== Math.round(startX) || Math.round(y) !== Math.round(startY)) {
      await win.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
    }
    await win.setSize(new LogicalSize(Math.round(w), Math.round(h)));
  } catch {}
}
