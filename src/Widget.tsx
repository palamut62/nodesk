import { openEditor, quitApp, startDrag } from "./lib/tauri";
import { Pencil, X } from "lucide-react";

export default function Widget() {
  return (
    <div className="widget">
      <div className="widget-pill">
        <div
          className="drag-area"
          onMouseDown={(e) => {
            if (e.button === 0) startDrag();
          }}
        >
          <span className="dot" />
          <span className="label">nodesk</span>
        </div>
        <button
          className="primary"
          title="Yeni not"
          onClick={() => openEditor()}
        >
          <Pencil size={16} />
        </button>
        <button title="Kapat" onClick={() => quitApp()}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
