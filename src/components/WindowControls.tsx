import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy as RestoreIcon } from "lucide-react";

export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const w = getCurrentWindow();
    w.isMaximized().then(setMaximized).catch(() => {});
    w.onResized(() => {
      w.isMaximized().then(setMaximized).catch(() => {});
    }).then((un) => { unlisten = un; });
    return () => { unlisten?.(); };
  }, []);

  const onMin = async () => {
    try { await getCurrentWindow().minimize(); } catch {}
  };
  const onMax = async () => {
    const w = getCurrentWindow();
    try {
      if (await w.isMaximized()) {
        await w.unmaximize();
        setMaximized(false);
      } else {
        await w.maximize();
        setMaximized(true);
      }
    } catch {}
  };

  return (
    <>
      <button onClick={onMin} title="Küçült" type="button">
        <Minus size={14} />
      </button>
      <button onClick={onMax} title={maximized ? "Geri al" : "Tam ekran"} type="button">
        {maximized ? <RestoreIcon size={12} /> : <Square size={12} />}
      </button>
    </>
  );
}
