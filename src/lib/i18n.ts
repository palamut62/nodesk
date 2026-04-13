import { useState, useEffect } from "react";

export type Lang = "tr" | "en";

const STORAGE_KEY = "nodesk-lang";

let currentLang: Lang = (localStorage.getItem(STORAGE_KEY) as Lang) || "tr";
const listeners = new Set<(lang: Lang) => void>();

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang) {
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  listeners.forEach((fn) => fn(lang));
}

export function useLang(): [Lang, (lang: Lang) => void] {
  const [lang, setLocal] = useState(currentLang);
  useEffect(() => {
    const handler = (l: Lang) => setLocal(l);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);
  return [lang, setLang];
}

const translations = {
  // Widget
  "nodesk": { tr: "nodesk", en: "nodesk" },
  "voice.record": { tr: "Sesli not kaydet", en: "Record voice note" },
  "voice.stop": { tr: "Kaydi durdur", en: "Stop recording" },
  "history": { tr: "Gecmis notlar", en: "Note history" },
  "newNote": { tr: "Yeni not", en: "New note" },
  "settings": { tr: "Ayarlar", en: "Settings" },
  "hideToTray": { tr: "Tray'e gizle", en: "Hide to tray" },
  "processing": { tr: "🔄 isleniyor…", en: "🔄 processing…" },
  "aiFixing": { tr: "🔄 AI duzeltiyor…", en: "🔄 AI fixing…" },
  "saved": { tr: "✓ kaydedildi", en: "✓ saved" },
  "empty": { tr: "bos", en: "empty" },

  // Editor
  "editNote": { tr: "notu duzenle", en: "edit note" },
  "newNoteTitle": { tr: "yeni not", en: "new note" },
  "untitled": { tr: "Basliksiz", en: "Untitled" },
  "notePlaceholder": { tr: "Notun buraya…", en: "Write here…" },
  "save": { tr: "Kaydet", en: "Save" },
  "cancel": { tr: "Iptal", en: "Cancel" },
  "close": { tr: "Kapat", en: "Close" },
  "open": { tr: "Ac", en: "Open" },
  "export": { tr: "Disa aktar", en: "Export" },
  "copy": { tr: "Kopyala", en: "Copy" },
  "copied": { tr: "Kopyalandi", en: "Copied" },
  "nothingToCopy": { tr: "Kopyalanacak icerik yok", en: "Nothing to copy" },
  "saving": { tr: "Kaydediliyor…", en: "Saving…" },
  "updating": { tr: "Guncelleniyor…", en: "Updating…" },
  "updated": { tr: "Guncellendi", en: "Updated" },
  "savedNote": { tr: "Kaydedildi", en: "Saved" },
  "emptyNote": { tr: "Bos not kaydedilemez", en: "Cannot save empty note" },
  "voiceNoteSaved": { tr: "Ses notu kaydedildi", en: "Voice note saved" },
  "noSound": { tr: "Ses bulunamadi", en: "No sound detected" },
  "statusHint": {
    tr: "Ctrl+S kaydet · Ctrl+Shift+V sesli not · Esc iptal",
    en: "Ctrl+S save · Ctrl+Shift+V voice note · Esc cancel",
  },
  "recording": { tr: "🔴 kaydediyor… (Ctrl+Shift+V ile durdur)", en: "🔴 recording… (Ctrl+Shift+V to stop)" },
  "aiFix": { tr: "AI ile duzelt", en: "AI fix" },
  "aiDone": { tr: "AI tamamladi", en: "AI done" },
  "noTextToFix": { tr: "Duzeltilecek metin yok", en: "No text to fix" },

  // Toolbar
  "heading1": { tr: "Baslik 1", en: "Heading 1" },
  "heading2": { tr: "Baslik 2", en: "Heading 2" },
  "heading3": { tr: "Baslik 3", en: "Heading 3" },
  "bold": { tr: "Kalin", en: "Bold" },
  "italic": { tr: "Italik", en: "Italic" },
  "underline": { tr: "Alti cizili", en: "Underline" },
  "strikethrough": { tr: "Ustu cizili", en: "Strikethrough" },
  "inlineCode": { tr: "Inline code", en: "Inline code" },
  "highlight": { tr: "Vurgula", en: "Highlight" },
  "bullet": { tr: "Madde", en: "Bullet list" },
  "numbered": { tr: "Numarali", en: "Numbered list" },
  "todo": { tr: "To-do", en: "To-do" },
  "quote": { tr: "Alinti", en: "Quote" },
  "divider": { tr: "Ayrac", en: "Divider" },
  "link": { tr: "Link", en: "Link" },
  "addLink": { tr: "Link ekle", en: "Add link" },
  "enterUrl": { tr: "URL gir:", en: "Enter URL:" },
  "add": { tr: "Ekle", en: "Add" },
  "voiceNote": { tr: "Sesli not (Ctrl+Shift+V)", en: "Voice note (Ctrl+Shift+V)" },

  // History
  "historyTitle": { tr: "gecmis notlar", en: "note history" },
  "search": { tr: "Ara…", en: "Search…" },
  "loading": { tr: "Yukleniyor…", en: "Loading…" },
  "noMatch": { tr: "Eslesen not yok", en: "No matching notes" },
  "noNotes": { tr: "Henuz not yok", en: "No notes yet" },
  "edit": { tr: "Duzenle", en: "Edit" },
  "delete": { tr: "Sil", en: "Delete" },
  "deleteNote": { tr: "Notu sil", en: "Delete note" },
  "deleteConfirm": { tr: "Bu notu kalici olarak silmek istedigine emin misin?", en: "Are you sure you want to permanently delete this note?" },
  "giveUp": { tr: "Vazgec", en: "Cancel" },

  // Settings
  "settingsTitle": { tr: "ayarlar", en: "settings" },
  "language": { tr: "Dil", en: "Language" },
  "aiProvider": { tr: "AI Saglayici", en: "AI Provider" },
  "model": { tr: "Model", en: "Model" },
  "refreshModels": { tr: "Modelleri yenile", en: "Refresh models" },
  "apiKey": { tr: "API Key", en: "API Key" },
  "serverUrl": { tr: "Sunucu URL", en: "Server URL" },
  "notionIntegration": { tr: "Notion Entegrasyonu", en: "Notion Integration" },
  "databaseId": { tr: "Database ID", en: "Database ID" },
  "titleProperty": { tr: "Baslik Property", en: "Title Property" },
  "autoStart": { tr: "Windows baslangicinда otomatik baslat", en: "Auto-start with Windows" },
  "voiceNoteTitle": { tr: "Sesli Not", en: "Voice Note" },

  // Screenshot
  "screenshot": { tr: "Ekran Alintisi", en: "Screenshot" },
  "takeScreenshot": { tr: "Ekran alintisi al", en: "Take screenshot" },
  "addText": { tr: "Yazi ekle", en: "Add text" },
  "addRect": { tr: "Dikdortgen", en: "Rectangle" },
  "addArrow": { tr: "Ok", en: "Arrow" },
  "blur": { tr: "Bulaniklastir", en: "Blur" },
  "blurInverse": { tr: "Dis Bulaniklastir", en: "Inverse Blur" },
  "color": { tr: "Renk", en: "Color" },
  "saveScreenshot": { tr: "Kaydet", en: "Save" },
  "discardScreenshot": { tr: "Iptal", en: "Discard" },
} as const;

type TransKey = keyof typeof translations;

export function t(key: TransKey): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[currentLang] || entry.tr;
}

export function useT(): (key: TransKey) => string {
  const [lang] = useLang();
  return (key: TransKey) => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang] || entry.tr;
  };
}
