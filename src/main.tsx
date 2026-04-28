import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Widget from "./Widget";
import DockedBar from "./DockedBar";
import Editor from "./Editor";
import History from "./History";
import Settings from "./Settings";
import ScreenshotEditor from "./ScreenshotEditor";
import OcrCapture from "./OcrCapture";
import ClipboardPanel from "./ClipboardPanel";
import Recorder from "./Recorder";
import VideoEditor from "./VideoEditor";
import { DialogHost } from "./components/Dialog";
import {
  applyDock,
  captureScreen,
  centerWindowBox,
  computeDockGeom,
  focusWindow,
  getNote,
  getSettings,
  setAlwaysOnTop,
  setWindowBox,
  VIEW_SIZES,
  type BarMode,
  type DockEdge,
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
  const [editorReturnView, setEditorReturnView] = useState<"pill" | "history">("pill");
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [barMode, setBarMode] = useState<BarMode>("floating");
  const [dockEdge, setDockEdge] = useState<DockEdge>("right");
  const [dockExpanded, setDockExpanded] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const w = getCurrentWindow();
    let un: (() => void) | undefined;
    w.isMaximized().then(setMaximized).catch(() => {});
    w.onResized(() => {
      w.isMaximized().then(setMaximized).catch(() => {});
    }).then((u) => { un = u; });
    return () => { un?.(); };
  }, []);

  const morphTo = useCallback(
    async (
      target: ViewKind,
      opts?: { noteId?: number | null; returnTo?: "pill" | "history" },
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;

      if (barMode === "docked") {
        setDockExpanded(false);
      }
      let size = VIEW_SIZES[target];
      if (target === "pill" && barMode === "docked") {
        const g = await computeDockGeom(dockEdge, false);
        size = { w: g.w, h: g.h };
      }
      const current = frame;
      const growing = size.w > current.w || size.h > current.h;
      const dockedAway = barMode === "docked" && target !== "pill";
      const dockedHome = barMode === "docked" && target === "pill";

      // Docked geçişler: önce eski view'ı tamamen gizle, sonra OS penceresini taşı,
      // sonra yeni view'ı göster — geçiş sırasında bar asla yanlış konumda görünmez.
      if (dockedAway || dockedHome) {
        setPhase("out");
        await new Promise((r) => setTimeout(r, CROSSFADE_MID));
        if (dockedAway) {
          await centerWindowBox(size.w, size.h);
        } else {
          await applyDock(dockEdge, false);
        }
        setFrame(size);
        setAlwaysOnTop(target === "pill");
      } else {
        if (growing) {
          await setWindowBox(size.w, size.h);
        }
        setPhase("out");
        requestAnimationFrame(() => setFrame(size));
        setAlwaysOnTop(target === "pill");
        await new Promise((r) => setTimeout(r, CROSSFADE_MID));
      }

      if (target === "editor") {
        setEditorReturnView(opts?.returnTo ?? "pill");
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

      if (target === "screenshot" || target === "ocr") {
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

      if (!growing && !dockedAway && !dockedHome) {
        await setWindowBox(size.w, size.h);
      }

      if (target !== "pill") focusWindow();
      busyRef.current = false;
    },
    [frame, barMode, dockEdge],
  );

  useEffect(() => {
    setAlwaysOnTop(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSettings();
        if (cancelled) return;
        const mode: BarMode = (s.bar_mode as BarMode) || "floating";
        const edge: DockEdge = (s.dock_edge as DockEdge) || "right";
        setBarMode(mode);
        setDockEdge(edge);
        if (mode === "docked") {
          await applyDock(edge, false);
          const g = await computeDockGeom(edge, false);
          setFrame({ w: g.w, h: g.h });
        }
      } catch {}
    })();

    const onConfig = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { barMode: BarMode; dockEdge: DockEdge };
      setBarMode(detail.barMode);
      setDockEdge(detail.dockEdge);
      setDockExpanded(false);
      if (detail.barMode === "docked") {
        const g = await computeDockGeom(detail.dockEdge, false);
        setFrame({ w: g.w, h: g.h });
      } else {
        setFrame(VIEW_SIZES.pill);
      }
    };
    window.addEventListener("nodesk-bar-config", onConfig as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("nodesk-bar-config", onConfig as EventListener);
    };
  }, []);

  const toggleDock = useCallback(async () => {
    if (busyRef.current) return;
    const next = !dockExpanded;
    setDockExpanded(next);
    await applyDock(dockEdge, next);
    const g = await computeDockGeom(dockEdge, next);
    setFrame({ w: g.w, h: g.h });
  }, [dockExpanded, dockEdge]);

  const collapseDock = useCallback(async () => {
    if (busyRef.current) return;
    if (!dockExpanded) return;
    setDockExpanded(false);
    await applyDock(dockEdge, false);
    const g = await computeDockGeom(dockEdge, false);
    setFrame({ w: g.w, h: g.h });
  }, [dockExpanded, dockEdge]);

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
        style={
          maximized && view !== "pill"
            ? { width: "100vw", height: "100vh" }
            : { width: frame.w, height: frame.h }
        }
      >
        {view === "pill" && barMode === "floating" && (
          <Widget
            onNewNote={() => morphTo("editor")}
            onHistory={() => morphTo("history")}
            onSettings={() => morphTo("settings")}
            onScreenshot={() => morphTo("screenshot")}
            onRecord={() => morphTo("recorder")}
            onOcr={() => morphTo("ocr")}
            onClipboard={() => morphTo("clipboard")}
            onVideoEdit={() => morphTo("videoEditor")}
          />
        )}
        {view === "pill" && barMode === "docked" && phase === "in" && (
          <DockedBar
            edge={dockEdge}
            expanded={dockExpanded}
            onToggle={toggleDock}
            onCollapse={collapseDock}
            onNewNote={() => morphTo("editor")}
            onHistory={() => morphTo("history")}
            onSettings={() => morphTo("settings")}
            onScreenshot={() => morphTo("screenshot")}
            onRecord={() => morphTo("recorder")}
            onOcr={() => morphTo("ocr")}
            onClipboard={() => morphTo("clipboard")}
            onVideoEdit={() => morphTo("videoEditor")}
          />
        )}
        {view === "editor" && (
          <Editor
            noteToLoad={noteToLoad}
            onClose={() => morphTo(editorReturnView)}
          />
        )}
        {view === "history" && (
          <History
            onOpenNote={(id) => morphTo("editor", { noteId: id, returnTo: "history" })}
            onClose={() => morphTo("pill")}
            onNewNote={() => morphTo("editor", { returnTo: "history" })}
          />
        )}
        {view === "settings" && (
          <Settings onClose={() => morphTo("pill")} />
        )}
        {view === "recorder" && (
          <Recorder onClose={() => morphTo("pill")} />
        )}
        {view === "screenshot" && screenshotData && (
          <ScreenshotEditor
            imageBase64={screenshotData}
            onClose={() => morphTo("pill")}
          />
        )}
        {view === "ocr" && screenshotData && (
          <OcrCapture
            imageBase64={screenshotData}
            onClose={() => morphTo("pill")}
          />
        )}
        {view === "clipboard" && (
          <ClipboardPanel onClose={() => morphTo("pill")} />
        )}
        {view === "videoEditor" && (
          <VideoEditor onClose={() => morphTo("pill")} />
        )}
      </div>
    </div>
  );
}

function Root() {
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
