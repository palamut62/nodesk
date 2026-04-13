mod db;
mod ollama;
mod openrouter;
mod screenshot;
mod settings;
mod whisper;

use db::{Db, Note};
use serde::{Deserialize, Serialize};
use settings::{ModelInfo, Settings, SettingsStore};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State, WebviewWindow,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveNotePayload {
    pub id: Option<i64>,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiFixPayload {
    pub text: String,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscribePayload {
    pub audio: Vec<u8>,
    pub mime: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub openrouter_configured: bool,
    pub openrouter_model: String,
}

#[tauri::command]
fn get_config(store: State<SettingsStore>) -> AppConfig {
    let s = store.get();
    AppConfig {
        openrouter_configured: !s.openrouter_api_key.is_empty(),
        openrouter_model: s.openrouter_model,
    }
}

#[tauri::command]
fn get_settings(store: State<SettingsStore>) -> Settings {
    let mut s = store.get();
    // API key'i frontend'e tam gösterme — sadece set edilmiş mi bilsin
    if !s.openrouter_api_key.is_empty() {
        s.openrouter_api_key = format!(
            "••••{}",
            &s.openrouter_api_key[s.openrouter_api_key.len().saturating_sub(4)..]
        );
    }
    s
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveSettingsPayload {
    pub openrouter_api_key: Option<String>,
    pub openrouter_model: Option<String>,
    pub autostart: Option<bool>,
    pub ai_provider: Option<String>,
    pub ollama_base_url: Option<String>,
    pub ollama_model: Option<String>,
}

#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    store: State<SettingsStore>,
    payload: SaveSettingsPayload,
) -> Result<(), String> {
    let mut cur = store.get();
    if let Some(k) = payload.openrouter_api_key {
        // maskeli gelirse (••••) değiştirme
        if !k.starts_with("••") && !k.is_empty() {
            cur.openrouter_api_key = k;
        } else if k.is_empty() {
            cur.openrouter_api_key = String::new();
        }
    }
    if let Some(m) = payload.openrouter_model {
        if !m.is_empty() {
            cur.openrouter_model = m;
        }
    }
    if let Some(p) = payload.ai_provider {
        if !p.is_empty() {
            cur.ai_provider = p;
        }
    }
    if let Some(u) = payload.ollama_base_url {
        if !u.is_empty() {
            cur.ollama_base_url = u;
        }
    }
    if let Some(m) = payload.ollama_model {
        if !m.is_empty() {
            cur.ollama_model = m;
        }
    }
    if let Some(a) = payload.autostart {
        cur.autostart = a;
        let manager = app.autolaunch();
        let _ = if a {
            manager.enable()
        } else {
            manager.disable()
        };
    }
    store.save(cur).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_models(store: State<'_, SettingsStore>) -> Result<Vec<ModelInfo>, String> {
    let s = store.get();
    if s.ai_provider == "ollama" {
        ollama::list_models(&s.ollama_base_url)
            .await
            .map_err(|e| e.to_string())
    } else {
        settings::list_openrouter_models(&s.openrouter_api_key)
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn save_note(db: State<Db>, payload: SaveNotePayload) -> Result<i64, String> {
    match payload.id {
        Some(id) => {
            db.update(id, &payload.title, &payload.content)
                .map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => db
            .insert(&payload.title, &payload.content)
            .map_err(|e| e.to_string()),
    }
}

#[tauri::command]
fn list_notes(db: State<Db>) -> Result<Vec<Note>, String> {
    db.list().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_note(db: State<Db>, id: i64) -> Result<Note, String> {
    db.get(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_note(db: State<Db>, id: i64) -> Result<(), String> {
    db.delete(id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ai_fix_text(
    store: State<'_, SettingsStore>,
    payload: AiFixPayload,
) -> Result<String, String> {
    let mode = payload.mode.as_deref().unwrap_or("fix");
    let s = store.get();
    if s.ai_provider == "ollama" {
        ollama::fix_text(&payload.text, mode, &s.ollama_base_url, &s.ollama_model)
            .await
            .map_err(|e| e.to_string())
    } else {
        openrouter::fix_text(&payload.text, mode, &s.openrouter_api_key, &s.openrouter_model)
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn transcribe_audio(payload: TranscribePayload) -> Result<String, String> {
    let mime = payload.mime.as_deref().unwrap_or("audio/webm");
    whisper::transcribe(payload.audio, mime)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn capture_screen(_window: WebviewWindow) -> Result<String, String> {
    screenshot::capture_screen().map_err(|e| e.to_string())
}

#[tauri::command]
fn start_drag(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn hide_to_tray(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();

    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required",
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let main = app.get_webview_window("main");
                    if shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyV)
                        && event.state() == ShortcutState::Pressed
                    {
                        if let Some(w) = &main {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.emit("voice-note-toggle", ());
                        }
                    }
                    if shortcut.matches(Modifiers::empty(), Code::F9) {
                        if let Some(w) = &main {
                            match event.state() {
                                ShortcutState::Pressed => {
                                    let _ = w.show();
                                    let _ = w.emit("voice-ptt-down", ());
                                }
                                ShortcutState::Released => {
                                    let _ = w.emit("voice-ptt-up", ());
                                }
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_config,
            get_settings,
            save_settings,
            list_models,
            save_note,
            list_notes,
            get_note,
            delete_note,
            ai_fix_text,
            transcribe_audio,
            read_text_file,
            write_text_file,
            start_drag,
            quit_app,
            hide_to_tray,
            capture_screen,
            write_binary_file
        ])
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();
            let db_path = data_dir.join("nodesk.db");
            let db = Db::open(db_path)?;
            app.manage(db);

            let settings_path = data_dir.join("settings.json");
            let store = SettingsStore::load(settings_path);
            app.manage(store);

            // Tray icon + menü
            let show_item = MenuItem::with_id(app, "show", "Göster / Gizle", true, None::<&str>)?;
            let settings_item =
                MenuItem::with_id(app, "settings", "Ayarlar", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &settings_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("nodesk")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => toggle_window(app),
                    "settings" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.emit("open-settings", ());
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            let toggle = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyV);
            let ptt = Shortcut::new(None, Code::F9);
            let gs = app.global_shortcut();
            let _ = gs.unregister_all();
            if let Err(e) = gs.register(toggle) {
                eprintln!("toggle shortcut kaydedilemedi: {e}");
            }
            if let Err(e) = gs.register(ptt) {
                eprintln!("ptt shortcut kaydedilemedi: {e}");
            }

            // Autostart durumunu settings ile senkronla
            let store: State<SettingsStore> = app.state();
            let want = store.get().autostart;
            let manager = app.autolaunch();
            let actual = manager.is_enabled().unwrap_or(false);
            if want && !actual {
                let _ = manager.enable();
            } else if !want && actual {
                let _ = manager.disable();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // X tuşu → kapatma yerine tray'e gizle
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
