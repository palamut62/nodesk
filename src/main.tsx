import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Widget from "./Widget";
import Editor from "./Editor";
import History from "./History";
import Settings from "./Settings";
import ScreenshotEditor from "./ScreenshotEditor";
import { DialogHost } from "./components/Dialog";
import {
  captureScreen,
  focusWindow,
  getNote,
  setAlwaysOnTop,
  setWindowBox,
  VIEW_SIZES,
  type Note,
  type ViewKind,
} from "./lib/tauri";
import "./styles/apple.css";

type Phase = "in" | "out";

const MORPH_MS = 380;
const CROSSFADE_MID = 170;

function App() {
  const [view, setView] = useState<ViewKind>("pill");
  const [phase, setPhase] = useState<Phase>("in");
  const [frame, setFrame] = useState(VIEW_SIZES.pill);
  const [noteToLoad, setNoteToLoad] = useState<Note | null>(null);
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const busyRef = useRef(false);

  const morphTo = useCallback(
    async (target: ViewKind, opts?: { noteId?: number | null }) => {
      if (busyRef.current) return;
      busyRef.current = true;

      const size = VIEW_SIZES[target];
      const current = frame;
      const growing = size.w > current.w || size.h > current.h;

      // Büyüyorsa: OS penceresini şimdi büyüt (hedef boyuta), CSS frame eski boyuttan
      // hedefe doğru transition ile büyür. Pencere transparent, dışı görünmez.
      // Küçülüyorsa: OS penceresi büyük kalır, CSS frame küçülür, bitiminde OS shrink.
      if (growing) {
        await setWindowBox(size.w, size.h);
      }

      setPhase("out");
      // Frame hedefe transition başlasın
      requestAnimationFrame(() => setFrame(size));
      setAlwaysOnTop(target === "pill");

      await new Promise((r) => setTimeout(r, CROSSFADE_MID));

      if (target === "editor") {
        if (opts?.noteId != null) {
          try {
            setNoteToLoad(await getNote(opts.noteId));
          } catch {
            setNoteToLoad(null);
          }
        } else {
          setNoteToLoad(null);
        }
      }

      if (target === "screenshot") {
        try {
          const win = getCurrentWindow();
          await win.hide();
          await new Promise((r) => setTimeout(r, 250));
          let data: string;
          try {
            data = await captureScreen();
          } finally {
            await win.show();
          }
          if (!data) throw new Error("empty screenshot data");
          setScreenshotData(data);
        } catch (err) {
          console.error("[screenshot] capture failed:", err);
          alert("Ekran alıntısı alınamadı: " + String(err));
          setScreenshotData(null);
          busyRef.current = false;
          morphTo("pill");
          return;
        }
      }

      setView(target);
      requestAnimationFrame(() => setPhase("in"));

      await new Promise((r) => setTimeout(r, MORPH_MS - CROSSFADE_MID + 20));

      if (!growing) {
        await setWindowBox(size.w, size.h);
      }

      if (target !== "pill") focusWindow();
      busyRef.current = false;
    },
    [frame],
  );

  useEffect(() => {
    setAlwaysOnTop(true);
  }, []);

  useEffect(() => {
    const un = listen("open-settings", () => {
      morphTo("settings");
    });
    return () => {
      un.then((f) => f());
    };
  }, [morphTo]);

  return (
    <div className={`app-root view-${view}`}>
      <DialogHost />
      <div
        className={`morph-frame phase-${phase}`}
        style={{ width: frame.w, height: frame.h }}
      >
        {view === "pill" && (
          <Widget
            onNewNote={() => morphTo("editor")}
            onHistory={() => morphTo("history")}
            onSettings={() => morphTo("settings")}
            onScreenshot={() => morphTo("screenshot")}
          />
        )}
        {view === "editor" && (
          <Editor
            noteToLoad={noteToLoad}
            onClose={() => morphTo("pill")}
          />
        )}
        {view === "history" && (
          <History
            onOpenNote={(id) => morphTo("editor", { noteId: id })}
            onClose={() => morphTo("pill")}
            onNewNote={() => morphTo("editor")}
          />
        )}
        {view === "settings" && (
          <Settings onClose={() => morphTo("pill")} />
        )}
        {view === "screenshot" && screenshotData && (
          <ScreenshotEditor
            imageBase64={screenshotData}
            onClose={() => morphTo("pill")}
          />
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
