<div align="center">
  <h1>nodesk</h1>

  <p><strong>always-on-top desktop notes, voice, AI, screenshots, and video tools</strong></p>

  <p>
    <a href="https://github.com/palamut62/nodesk/stargazers"><img alt="stars" src="https://img.shields.io/github/stars/palamut62/nodesk?style=flat-square&label=stars&color=ffd33d&labelColor=555555"></a>
    <a href="https://github.com/palamut62/nodesk/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/palamut62/nodesk?style=flat-square&label=last%20commit&color=6fdd8b&labelColor=555555"></a>
    <a href="#license"><img alt="license" src="https://img.shields.io/badge/license-MIT-8bd100?style=flat-square&labelColor=555555"></a>
    <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24c8db?style=flat-square&labelColor=555555">
    <img alt="React 19" src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&labelColor=555555">
  </p>

  <p>
    <a href="#features">Features</a> •
    <a href="#installation">Installation</a> •
    <a href="#configuration">Configuration</a> •
    <a href="#keyboard-shortcuts">Shortcuts</a> •
    <a href="#tech-stack">Tech Stack</a>
  </p>

  <p>
    <strong>nodesk workspace</strong> · notes, dictation, OCR, clipboard history, screen recording, and mini video editing
  </p>
</div>

A lightweight, always-on-top desktop note widget built with Tauri 2 + React. Sits quietly in the corner of your screen, ready whenever you need it.

![nodesk widget](assets/preview.png?v=3)

---

## Features

- **Floating pill widget or docked bar** — always-on-top, borderless, draggable. Choose between a floating pill or a slim bar docked to the left/right/bottom edge of the screen.
- **Rich text editor** — TipTap-powered with headings, lists, to-do checkboxes, quotes, code blocks, highlights, and links.
- **Voice notes** — press the mic button (or `Ctrl+Shift+V` / `F9` push-to-talk) to dictate. Transcribed via Groq Whisper, then auto-corrected by your AI provider.
- **AI text fixing** — fix grammar, shorten, expand, or reformat — powered by OpenRouter, NVIDIA, or a local Ollama model.
- **Note history** — searchable list of all saved notes with tag filtering.
- **Screenshot capture** — grab the full screen, annotate with text, arrows, rectangles, and blur, then save or copy to clipboard.
- **OCR** — extract text from any region of the screen using the Windows Media OCR engine.
- **Clipboard manager** — keeps a history of recent copies, pin items, and re-paste with one click.
- **Screen recorder** — record the full screen or a custom region as MP4 or GIF (requires FFmpeg).
- **Mini video editor** — open any local video (mp4, mov, webm, mkv, avi, wmv, flv, m4v, mpg, ts, gif) and:
  - Trim with a draggable timeline (start/end handles).
  - Add multiple **blur regions** with live canvas preview — choose **inside** (blur the rectangle) or **outside** (blur everything except the rectangle).
  - Each blur can be **always-on or time-ranged** — e.g. blur an API key only between 0:12 and 0:18 of the video. Drag the segment on the timeline to retime it; drag the corners to resize the rectangle; use the corner grip to move it.
  - Adjust blur strength per region.
  - **Add or replace audio** with volume control and mix with the original soundtrack.
  - Export to **MP4 (H.264)**, **WebM (VP9)**, **MOV (H.264)**, or **GIF**.
  - Auto-transcodes a fast preview when the source format isn't natively decodable in WebView2 (e.g. WMV) — original file is still used for export, so quality is preserved.
- **System tray** — minimizes to tray on close; toggle visibility from the tray icon or left-click.
- **Auto-start with Windows** — optional, toggled from Settings.
- **Local SQLite storage** — all notes stored on-device, no cloud dependency.
- **Triple AI backend** — OpenRouter (cloud), NVIDIA NIM (cloud), or Ollama (local/private).

---

## Installation

### Pre-built installer

Download the latest release from [GitHub Releases](https://github.com/palamut62/nodesk/releases) and run:

```
nodesk_0.1.0_x64-setup.exe
```

No extra dependencies needed — WebView2 is already bundled in Windows 11.

### Build from source

**Prerequisites**
- [Node.js 20+](https://nodejs.org)
- [Rust (stable)](https://rustup.rs)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/)
- FFmpeg in PATH (optional — required for screen recording)

```bash
git clone https://github.com/palamut62/nodesk.git
cd nodesk
npm install
cp .env.example .env   # fill in your keys
npm run tauri dev
```

**Production build**

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

---

## Configuration

Create a `.env` file in the project root (see `.env.example`):

```env
# AI text fixing (OpenRouter - https://openrouter.ai)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-4o-mini

# Voice transcription (Groq Whisper - https://console.groq.com, free tier available)
GROQ_API_KEY=gsk_...

# Optional: use a local Ollama model instead of OpenRouter
# AI_PROVIDER=ollama
# OLLAMA_BASE_URL=http://127.0.0.1:11434
# OLLAMA_MODEL=llama3
```

All settings can also be configured at runtime from the **Settings** panel inside the app. API keys are stored locally in the app data directory.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+V` | Toggle voice recording |
| `F9` (hold) | Push-to-talk voice note |
| `Ctrl+S` | Save note (inside editor) |
| `Escape` | Close editor / cancel |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust + WebView2) |
| Frontend | React 19 + TypeScript + Vite |
| Rich text | [TipTap](https://tiptap.dev) (ProseMirror) |
| Database | SQLite via `rusqlite` (bundled) |
| HTTP | `reqwest` (Rust) |
| AI text | [OpenRouter](https://openrouter.ai) / [Ollama](https://ollama.com) |
| Transcription | [Groq Whisper](https://console.groq.com) |
| Auto-start | `tauri-plugin-autostart` |
| Global shortcuts | `tauri-plugin-global-shortcut` |

Bundle size: ~5 MB installer, ~20 MB installed.

---

## Project Structure

```
nodesk/
├── src/                     # React frontend
│   ├── main.tsx             # App root
│   ├── Widget.tsx           # Floating pill widget
│   ├── Editor.tsx           # Rich text editor
│   ├── History.tsx          # Note history list
│   ├── Settings.tsx         # Settings panel
│   ├── Recorder.tsx         # Screen recorder (MP4/GIF)
│   ├── VideoEditor.tsx      # Mini video editor (trim, blur, audio, formats)
│   ├── OcrCapture.tsx       # OCR text extraction
│   ├── ClipboardPanel.tsx   # Clipboard manager
│   ├── DockedBar.tsx        # Edge-docked compact bar
│   ├── ScreenshotEditor.tsx # Screenshot annotation
│   ├── lib/tauri.ts         # Tauri invoke wrappers
│   └── styles/apple.css     # Apple Notes-inspired theme
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs           # Tauri commands + app setup
│   │   ├── db.rs            # SQLite note storage
│   │   ├── openrouter.rs    # OpenRouter API client
│   │   ├── ollama.rs        # Ollama API client
│   │   ├── whisper.rs       # Groq Whisper transcription
│   │   ├── recorder.rs      # FFmpeg screen recording + video editor pipeline
│   │   ├── ocr.rs           # Windows OCR engine
│   │   ├── clipboard.rs     # Clipboard history watcher
│   │   ├── nvidia.rs        # NVIDIA NIM API client
│   │   ├── screenshot.rs    # Screen capture
│   │   └── settings.rs      # Persistent settings store
│   └── tauri.conf.json
├── assets/
│   └── preview.png
├── .env.example
└── package.json
```

---

## License

MIT
