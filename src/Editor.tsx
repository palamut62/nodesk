import { useEffect, useMemo, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AppProvider, useApp } from "./lib/app-state";
import { TooltipProvider } from "./components/ui/tooltip";
import { Home as NoteHome } from "./pages/home";
import { Toaster } from "./components/ui/sonner";
import WindowControls from "./components/WindowControls";
import { getSettings, type Note as TauriNote } from "./lib/tauri";
import "./index.css";

interface Props {
  noteToLoad: TauriNote | null;
  onClose: () => void;
}

const noteQueryClient = new QueryClient();

function normalizeTags(tags: string): string[] {
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function Bridge({ noteToLoad }: { noteToLoad: TauriNote | null }) {
  const { createNote, updateNote, setActiveNoteId, settings, updateSettings } = useApp();
  const mapRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSettings();
        if (cancelled) return;
        updateSettings({
          provider:
            s.ai_provider === "nvidia" || s.ai_provider === "groq"
              ? s.ai_provider
              : "openrouter",
          openrouterApiKey: s.openrouter_api_key || "",
          openrouterModel: s.openrouter_model || settings.openrouterModel || "",
          nvidiaApiKey: s.nvidia_api_key || "",
          nvidiaModel: s.nvidia_model || settings.nvidiaModel || "",
          groqApiKey: s.groq_api_key || "",
          groqModel: settings.groqModel || "openai/gpt-oss-20b",
        });
      } catch (e) {
        console.warn("[editor] failed to hydrate AI settings from backend", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (settings.theme !== "apple-yellow") {
      updateSettings({ theme: "apple-yellow" });
    }
  }, [settings.theme, updateSettings]);

  useEffect(() => {
    if (!noteToLoad) return;

    const mappedId = mapRef.current.get(noteToLoad.id);
    if (mappedId) {
      updateNote(mappedId, {
        title: noteToLoad.title || "untitled",
        content: noteToLoad.content || "",
        tags: normalizeTags(noteToLoad.tags || ""),
      });
      setActiveNoteId(mappedId);
      return;
    }

    const newId = createNote({
      title: noteToLoad.title || "untitled",
      content: noteToLoad.content || "",
      tags: normalizeTags(noteToLoad.tags || ""),
    });
    mapRef.current.set(noteToLoad.id, newId);
    setActiveNoteId(newId);
  }, [noteToLoad, createNote, updateNote, setActiveNoteId]);

  return <NoteHome />;
}

export default function Editor({ noteToLoad, onClose }: Props) {
  const providerTree = useMemo(
    () => (
      <QueryClientProvider client={noteQueryClient}>
        <TooltipProvider>
          <AppProvider>
            <Bridge noteToLoad={noteToLoad} />
            <Toaster />
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    ),
    [noteToLoad],
  );

  return (
    <div className="editor-shell nodesk-note-home-shell">
      <div className="editor-card nodesk-note-home-card">
        <div className="editor-titlebar">
          <div style={{ width: 78 }} />
          <div className="title">NOTESK</div>
          <WindowControls />
          <button onClick={onClose} title="Kapat" type="button">
            <X size={14} />
          </button>
        </div>
        <div className="nodesk-note-home-body">{providerTree}</div>
      </div>
    </div>
  );
}
