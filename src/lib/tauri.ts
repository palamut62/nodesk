import { invoke } from "@tauri-apps/api/core";

export interface AppConfig {
  notion_configured: boolean;
  openrouter_configured: boolean;
  openrouter_model: string;
}

export const getConfig = () => invoke<AppConfig>("get_config");

export const saveToNotion = (title: string, content_markdown: string) =>
  invoke<string>("save_to_notion", { payload: { title, content_markdown } });

export const aiFixText = (text: string, mode: "fix" | "shorten" | "expand" | "format" = "fix") =>
  invoke<string>("ai_fix_text", { payload: { text, mode } });

export const openEditor = () => invoke<void>("open_editor");
export const closeEditor = () => invoke<void>("close_editor");
export const startDrag = () => invoke<void>("start_drag");
export const quitApp = () => invoke<void>("quit_app");
