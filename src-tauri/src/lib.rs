mod notion;
mod openrouter;

use serde::{Deserialize, Serialize};
use tauri::{Manager, WebviewWindow};

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveNotePayload {
    pub title: String,
    pub content_markdown: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiFixPayload {
    pub text: String,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub notion_configured: bool,
    pub openrouter_configured: bool,
    pub openrouter_model: String,
}

#[tauri::command]
fn get_config() -> AppConfig {
    let notion_key = std::env::var("NOTION_API_KEY").ok();
    let notion_db = std::env::var("NOTION_DATABASE_ID").ok();
    let or_key = std::env::var("OPENROUTER_API_KEY").ok();
    AppConfig {
        notion_configured: notion_key.is_some() && notion_db.is_some(),
        openrouter_configured: or_key.is_some(),
        openrouter_model: std::env::var("OPENROUTER_MODEL")
            .unwrap_or_else(|_| "openai/gpt-4o-mini".to_string()),
    }
}

#[tauri::command]
async fn save_to_notion(payload: SaveNotePayload) -> Result<String, String> {
    notion::save_note(&payload.title, &payload.content_markdown)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ai_fix_text(payload: AiFixPayload) -> Result<String, String> {
    let mode = payload.mode.as_deref().unwrap_or("fix");
    openrouter::fix_text(&payload.text, mode)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_editor(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("editor") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        win.center().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_editor(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("editor") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn start_drag(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // .env dosyasını yükle (development & yanına konmuşsa)
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_to_notion,
            ai_fix_text,
            open_editor,
            close_editor,
            start_drag,
            quit_app
        ])
        .setup(|app| {
            if let Some(editor) = app.get_webview_window("editor") {
                let _ = editor.hide();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
