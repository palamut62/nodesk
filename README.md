# nodesk

Always-on-top desktop notes workspace built with Tauri 2 + React 19.

nodesk combines:
- a floating/docked quick-access bar
- a full-featured note workspace (sidebar, tabs, status bar, Kanban, calendar)
- AI-assisted writing across multiple providers with automatic fallback
- screenshot, OCR, clipboard, recorder, and mini video editing tools

![nodesk widget](assets/preview.png?v=3)

## Features

### Note workspace (editor view)
- Note list sidebar with folders, pinning, search, sorting, and tag filtering.
- Tab bar, global tag bar, and status bar (word/char count, versions, save indicator).
- Rich text editor (TipTap): headings, lists, tasks, code, tables, links, callouts, alignment, line-height, format painter.
- Drawing mode with pen/highlight/shapes and export to PNG.
- Floating text boxes and floating images.
- Header/footer controls with page-aware layout.
- Multi-view notes: editor, Kanban, calendar.
- Templates, print preview, import/export (`txt`, `md`, `docx`, JSON backup).
- Version history and note encryption dialog.
- Built-in AI chat panel that can target the active note or every saved note.

### AI features
nodesk talks to four providers from a single settings panel and applies an automatic
fallback chain when a request is rate-limited or times out (the active provider is
tried first, then any other provider that has a key + model configured).

| Capability | Where it appears | Backend |
|---|---|---|
| Chat with note(s) (streaming) | AI chat panel — single note or all-notes mode | OpenRouter / NVIDIA NIM / Groq |
| Fix grammar & spelling | Editor toolbar → "AI fix" | Active provider, customizable prompt |
| Translate selection / note | Editor toolbar → translate menu | Active provider |
| Summarize note | Editor toolbar → summarize | Active provider |
| Tag suggestions | Tag bar → AI suggest | Active provider |
| Inline single-word fix | Typing assistance | Active provider |
| Voice → text transcription | Voice note button, `Ctrl+Shift+V`, `F9` push-to-talk | Groq Whisper `whisper-large-v3-turbo` or OpenRouter Whisper |
| Image OCR | OCR capture panel, screenshot OCR | NVIDIA NIM `meta/llama-3.2-11b-vision-instruct` |

Defaults out of the box:
- `AI_PROVIDER=openrouter`
- `OPENROUTER_MODEL=openai/gpt-oss-20b:free` — fast, free, no upstream rate limits at time of writing
- OCR is hard-wired to `meta/llama-3.2-11b-vision-instruct` (requires an NVIDIA API key)
- Voice transcription requires a Groq or OpenRouter key (NVIDIA is not supported for audio)

You can change the active provider and per-provider model from the in-app **Settings** dialog at any time — the model dropdown is populated by calling `/v1/models` on the selected provider.

### Desktop tools
- Floating pill mode or docked bar mode (left/right/bottom).
- Global history and quick-open flows.
- Screenshot capture + annotation.
- OCR capture panel.
- Clipboard history manager.
- Screen recording (FFmpeg required for full workflow).
- Mini video editor (trim, blur regions, audio replace/mix, export formats).
- System tray integration and autostart.

## Installation

### Prebuilt (Windows)

Download from Releases and run:

- `nodesk_0.1.0_x64-setup.exe`
- or `nodesk_0.1.0_x64_en-US.msi`

### Build from source

Prerequisites:
- Node.js 20+
- Rust stable toolchain
- Tauri prerequisites for Windows
- FFmpeg in `PATH` (optional but required for recorder/video tools)

```bash
git clone https://github.com/palamut62/nodesk.git
cd nodesk
npm install
npm run tauri dev
```

Production build:

```bash
npm run tauri build
```

Build artifacts:
- `src-tauri/target/release/nodesk.exe`
- `src-tauri/target/release/bundle/nsis/nodesk_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/nodesk_0.1.0_x64_en-US.msi`

## Configuration

Runtime settings are available inside the app (`Settings` dialogs/panels).  
API keys are persisted locally in app data (`settings.json`).

Optional environment bootstrap (`.env`):

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-oss-20b:free
NVIDIA_API_KEY=nvapi-...
NVIDIA_MODEL=openai/gpt-oss-20b
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-20b
AI_PROVIDER=openrouter
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3
```

## Tech stack

- Desktop: Tauri 2 (Rust + WebView2)
- Frontend: React 19 + TypeScript + Vite
- Editor: TipTap / ProseMirror
- Storage: SQLite (`rusqlite`) + local JSON settings
- HTTP clients: `reqwest` (Rust) and provider API integrations

## Project structure (high level)

```text
src/
  main.tsx
  Widget.tsx
  DockedBar.tsx
  Editor.tsx
  pages/home.tsx
  components/
    editor/
    drawing/
    sidebar.tsx
    settings-dialog.tsx
    ai-chat-panel.tsx
    ...
src-tauri/src/
  lib.rs
  db.rs
  settings.rs
  openrouter.rs
  nvidia.rs
  ollama.rs
  whisper.rs
  recorder.rs
  screenshot.rs
  clipboard.rs
  ...
```

## License

MIT
