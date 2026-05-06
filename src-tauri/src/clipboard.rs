// Pano takibi: arboard ile sistem clipboard'u her 1.5s'de okuyup degisikligi yakalar.
// JSON dosyasinda saklar. Sabit 10 unpinned + sinirsiz pinned.

use anyhow::Result;
use arboard::Clipboard;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const MAX_UNPINNED: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipItem {
    pub id: u64,
    pub text: String,
    pub pinned: bool,
    pub ts: i64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ClipFile {
    items: Vec<ClipItem>,
    next_id: u64,
}

pub struct ClipStore {
    path: PathBuf,
    inner: Mutex<ClipFile>,
    suppress_next: Mutex<Option<String>>, // kendi yazdigimizi tekrar eklememek icin
}

impl ClipStore {
    pub fn load(path: PathBuf) -> Self {
        let inner = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<ClipFile>(&s).ok())
            .unwrap_or_default();
        Self {
            path,
            inner: Mutex::new(inner),
            suppress_next: Mutex::new(None),
        }
    }

    fn save(&self, file: &ClipFile) {
        if let Ok(s) = serde_json::to_string_pretty(file) {
            let _ = std::fs::write(&self.path, s);
        }
    }

    pub fn list(&self) -> Vec<ClipItem> {
        let f = self.inner.lock().unwrap();
        let mut out: Vec<ClipItem> = f.items.clone();
        // Sıralama: pinned önce (ts desc), sonra unpinned (ts desc).
        out.sort_by(|a, b| {
            b.pinned
                .cmp(&a.pinned)
                .then_with(|| b.ts.cmp(&a.ts))
        });
        out
    }

    pub fn add_text(&self, text: &str) -> Option<ClipItem> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return None;
        }
        let mut f = self.inner.lock().unwrap();
        // Aynı text varsa: pinned ise dokunma, unpinned ise ts guncelle (ust'e cikar).
        if let Some(existing) = f.items.iter_mut().find(|i| i.text == trimmed) {
            existing.ts = chrono::Utc::now().timestamp();
            let snap = existing.clone();
            self.save(&f);
            return Some(snap);
        }
        f.next_id = f.next_id.wrapping_add(1);
        let item = ClipItem {
            id: f.next_id,
            text: trimmed.to_string(),
            pinned: false,
            ts: chrono::Utc::now().timestamp(),
        };
        f.items.push(item.clone());
        // Trim: unpinned'leri 10'a kirp.
        let mut unpinned: Vec<&ClipItem> = f.items.iter().filter(|i| !i.pinned).collect();
        unpinned.sort_by(|a, b| b.ts.cmp(&a.ts));
        if unpinned.len() > MAX_UNPINNED {
            let keep_ids: std::collections::HashSet<u64> =
                unpinned.iter().take(MAX_UNPINNED).map(|i| i.id).collect();
            f.items.retain(|i| i.pinned || keep_ids.contains(&i.id));
        }
        self.save(&f);
        Some(item)
    }

    pub fn toggle_pin(&self, id: u64) -> Result<()> {
        let mut f = self.inner.lock().unwrap();
        if let Some(it) = f.items.iter_mut().find(|i| i.id == id) {
            it.pinned = !it.pinned;
        }
        self.save(&f);
        Ok(())
    }

    pub fn delete(&self, id: u64) -> Result<()> {
        let mut f = self.inner.lock().unwrap();
        if f.items.iter().any(|i| i.id == id && i.pinned) {
            anyhow::bail!("pinli kaydi silmek icin once pini kaldirin");
        }
        f.items.retain(|i| i.id != id);
        self.save(&f);
        Ok(())
    }

    pub fn get_text(&self, id: u64) -> Option<String> {
        let f = self.inner.lock().unwrap();
        f.items.iter().find(|i| i.id == id).map(|i| i.text.clone())
    }

    pub fn suppress(&self, text: &str) {
        *self.suppress_next.lock().unwrap() = Some(text.to_string());
    }

    fn check_suppressed(&self, text: &str) -> bool {
        let mut s = self.suppress_next.lock().unwrap();
        if s.as_deref() == Some(text) {
            *s = None;
            true
        } else {
            false
        }
    }
}

pub fn start_watcher(app: AppHandle, store: Arc<ClipStore>) {
    std::thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("clipboard init failed: {e}");
                return;
            }
        };
        let mut last_text: Option<String> = clipboard.get_text().ok();
        loop {
            std::thread::sleep(Duration::from_millis(1500));
            let cur = match clipboard.get_text() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if Some(&cur) == last_text.as_ref() {
                continue;
            }
            last_text = Some(cur.clone());
            if store.check_suppressed(&cur) {
                continue;
            }
            if let Some(item) = store.add_text(&cur) {
                let _ = app.emit("clipboard-changed", &item);
            }
        }
    });
}

pub fn write_text(text: &str) -> Result<()> {
    let mut cb = Clipboard::new()?;
    cb.set_text(text.to_string())?;
    Ok(())
}
