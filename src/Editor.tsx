import { useEffect, useMemo, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AppProvider, useApp } from "./lib/app-state";
import { TooltipProvider } from "./components/ui/tooltip";
import { Home as NoteHome } from "./pages/home";
import { Toaster } from "./components/ui/sonner";
import WindowControls from "./components/WindowControls";
import type { Note as TauriNote } from "./lib/tauri";
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
