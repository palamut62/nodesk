# CLAUDE.md — nodesk

## Amaç
Notion tarzı, Apple Notes renk temasında masaüstü not uygulaması.
- Ekranda sürüklenebilir küçük bir **widget** durur (always-on-top, borderless).
- Widget'a tıklayınca **editor penceresi** açılır.
- Editor: TipTap tabanlı zengin metin editörü (başlık, liste, to-do, quote, code, link, highlight…).
- **Kaydet** → not Notion API üzerinden kullanıcının database'ine yazılır.
- **AI düzelt** → OpenRouter üzerinden yazım/dilbilgisi düzeltmesi.

## Teknoloji
- **Tauri 2** (Rust + WebView) — hafif bundle (~3–5 MB)
- **React 19 + TypeScript** + Vite
- **TipTap** (ProseMirror) rich text editor
- **reqwest** (Rust) → Notion & OpenRouter HTTP
- **dotenvy** → `.env` yükleme

## Klasör Yapısı
```
nodesk/
├── src/                       # React frontend
│   ├── main.tsx               # Hash router (#/widget · #/editor)
│   ├── Widget.tsx             # Küçük draggable pill
│   ├── Editor.tsx             # Full editor + toolbar
│   ├── lib/tauri.ts           # invoke wrapper
│   └── styles/apple.css       # Apple Notes teması
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # Tauri setup + komut kayıtları
│   │   ├── notion.rs          # Notion API çağrısı + markdown → blocks
│   │   └── openrouter.rs      # OpenRouter chat completion
│   ├── tauri.conf.json        # İki pencere tanımı
│   └── capabilities/default.json
├── .env.example
└── package.json
```

## Ortam Değişkenleri (.env)
- `NOTION_API_KEY` — Notion internal integration secret
- `NOTION_DATABASE_ID` — hedef database ID
- `NOTION_TITLE_PROPERTY` — başlık property adı (varsayılan `Name`)
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` — varsayılan `openai/gpt-4o-mini`

## Notion Kurulumu
1. https://www.notion.so/profile/integrations → **New integration** → Internal → copy secret.
2. Notion'da bir database aç (title property'si olsun).
3. Database sayfasında **•••  → Connections → integration'ını ekle**.
4. Database URL'inden ID'yi al: `notion.so/workspace/<DATABASE_ID>?v=…` (tireleri sil veya bırak, ikisi de çalışır).

## Geliştirme
```bash
npm install
npm run tauri dev
```

## Build
```bash
npm run tauri build
# → src-tauri/target/release/bundle/
```

## Mimari Notları
- Tauri `tauri.conf.json`'da iki pencere: `widget` (küçük, transparent, alwaysOnTop) ve `editor` (gizli başlar, komutla gösterilir).
- Hash router — aynı bundle iki pencereyi sürdürür (`#/widget` vs `#/editor`).
- Widget'ın sürüklenmesi için `-webkit-app-region: drag` + `start_dragging()` kombinasyonu.
- Editor → Notion: HTML (TipTap) → basit markdown → Rust tarafında Notion blocks JSON.
- AI düzeltme: düz metin → OpenRouter → düzeltilmiş metin, editöre paragraf olarak geri set.

## Kod Stili
- TypeScript strict, React 19 fonksiyonel bileşenler.
- Rust: `anyhow::Result`, spesifik `thiserror` gerekmedikçe sade string error.
- Türkçe kullanıcı metinleri, kod isimleri İngilizce.
