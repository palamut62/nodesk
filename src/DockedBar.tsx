import { useEffect, useRef } from "react";
import {
  Pencil,
  History as HistoryIcon,
  Mic,
  X,
  Settings as SettingsIcon,
  Square,
  Camera,
  Video,
  Scissors,
  AlertCircle,
  ScanText,
  Clipboard,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { hideToTray, type DockEdge } from "./lib/tauri";
import { useT } from "./lib/legacy-i18n";
import { useVoiceRecorder } from "./lib/useVoiceRecorder";

interface Props {
  edge: DockEdge;
  expanded: boolean;
  onToggle: () => void;
  onCollapse: () => void;
  onNewNote: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onScreenshot: () => void;
  onRecord: () => void;
  onOcr: () => void;
  onClipboard: () => void;
  onVideoEdit: () => void;
}

export default function DockedBar({
  edge,
  expanded,
  onToggle,
  onCollapse,
  onNewNote,
  onHistory,
  onSettings,
  onScreenshot,
  onRecord,
  onOcr,
  onClipboard,
  onVideoEdit,
}: Props) {
  const t = useT();
  const { recording, busy, error, setError, toggleVoice } = useVoiceRecorder();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !recording) onCollapse();
    };
    const onBlur = () => {
      if (!recording) onCollapse();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [expanded, recording, onCollapse]);

  const isVertical = edge === "right" || edge === "left";
  const HandleIcon = expanded
    ? edge === "right"
      ? ChevronRight
      : edge === "left"
      ? ChevronLeft
      : ChevronDown
    : edge === "right"
    ? ChevronLeft
    : edge === "left"
    ? ChevronRight
    : ChevronUp;

  if (!expanded) {
    return (
      <div className={`docked-root edge-${edge} collapsed`}>
        <button
          className="docked-handle"
          onClick={onToggle}
          title={t("expand")}
          aria-label={t("expand")}
        >
          <span className={`handle-line ${isVertical ? "v" : "h"}`} />
        </button>
      </div>
    );
  }

  return (
    <div className={`docked-root edge-${edge} expanded`}>
      <div
        ref={panelRef}
        className={`docked-panel ${isVertical ? "vertical" : "horizontal"} ${
          recording ? "recording" : ""
        }`}
      >
        <button
          className="docked-handle inline"
          onClick={onCollapse}
          title={t("collapse")}
          aria-label={t("collapse")}
        >
          <HandleIcon size={14} />
        </button>

        {error && !recording && (
          <button
            className="docked-btn err"
            title={error}
            onClick={() => setError("")}
          >
            <AlertCircle size={15} />
          </button>
        )}

        <button
          title={recording ? t("voice.stop") : t("voice.record")}
          onClick={toggleVoice}
          disabled={busy}
          className={`docked-btn ${recording ? "mic-recording" : ""}`}
        >
          {recording ? <Square size={14} /> : <Mic size={16} />}
        </button>

        {!recording && (
          <>
            <button className="docked-btn" title={t("history")} onClick={onHistory} disabled={busy}>
              <HistoryIcon size={16} />
            </button>
            <button className="docked-btn" title={t("takeScreenshot")} onClick={onScreenshot} disabled={busy}>
              <Camera size={16} />
            </button>
            <button className="docked-btn" title="GIF kaydı" onClick={onRecord} disabled={busy}>
              <Video size={16} />
            </button>
            <button className="docked-btn" title="Video düzenle" onClick={onVideoEdit} disabled={busy}>
              <Scissors size={16} />
            </button>
            <button className="docked-btn" title="OCR" onClick={onOcr} disabled={busy}>
              <ScanText size={16} />
            </button>
            <button className="docked-btn" title="Pano" onClick={onClipboard} disabled={busy}>
              <Clipboard size={16} />
            </button>
            <button className="docked-btn primary" title={t("newNote")} onClick={onNewNote} disabled={busy}>
              <Pencil size={16} />
            </button>
            <button className="docked-btn" title={t("settings")} onClick={onSettings} disabled={busy}>
              <SettingsIcon size={16} />
            </button>
            <button className="docked-btn" title={t("hideToTray")} onClick={() => hideToTray()} disabled={busy}>
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
