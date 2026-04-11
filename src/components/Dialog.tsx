import { useEffect, useState, type ReactNode } from "react";

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PromptOpts {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

type DialogState =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | {
      kind: "prompt";
      opts: PromptOpts;
      resolve: (v: string | null) => void;
    }
  | null;

let setter: ((s: DialogState) => void) | null = null;

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    setter?.({ kind: "confirm", opts, resolve });
  });
}

export function promptDialog(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    setter?.({ kind: "prompt", opts, resolve });
  });
}

export function DialogHost() {
  const [state, setState] = useState<DialogState>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    setter = setState;
    return () => {
      setter = null;
    };
  }, []);

  useEffect(() => {
    if (state?.kind === "prompt") {
      setInputValue(state.opts.defaultValue ?? "");
    }
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
      if (e.key === "Enter" && state.kind === "confirm") {
        e.preventDefault();
        close(true);
      }
      if (e.key === "Enter" && state.kind === "prompt") {
        e.preventDefault();
        close(inputValue);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [state, inputValue]);

  if (!state) return null;

  const close = (result: any) => {
    if (state.kind === "confirm") state.resolve(Boolean(result));
    else state.resolve(result ?? null);
    setState(null);
  };

  const opts = state.opts as ConfirmOpts & PromptOpts;
  const isDanger = state.kind === "confirm" && opts.danger;

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div className="dialog-card">
        <div className="dialog-title">{opts.title}</div>
        {opts.message && <div className="dialog-message">{opts.message}</div>}
        {state.kind === "prompt" && (
          <input
            className="dialog-input"
            autoFocus
            placeholder={opts.placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        )}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => close(null)}>
            {opts.cancelText ?? "İptal"}
          </button>
          <button
            className={`btn ${isDanger ? "danger" : "primary"}`}
            autoFocus={state.kind === "confirm"}
            onClick={() =>
              close(state.kind === "prompt" ? inputValue : true)
            }
          >
            {opts.confirmText ?? (isDanger ? "Sil" : "Tamam")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastSlot({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
