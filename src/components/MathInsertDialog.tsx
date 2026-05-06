import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Editor } from "@tiptap/react";

interface Props {
  open: boolean;
  onClose: () => void;
  editor: Editor | null;
}

const EXAMPLES = [
  { label: "Karekök", formula: "\\sqrt{x^2 + y^2}" },
  { label: "Kesir", formula: "\\frac{a}{b}" },
  { label: "İntegral", formula: "\\int_0^\\infty e^{-x} dx" },
  { label: "Toplam", formula: "\\sum_{i=1}^{n} x_i" },
  { label: "Matris", formula: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
  { label: "Limit", formula: "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1" },
];

export function MathInsertDialog({ open, onClose, editor }: Props) {
  const [formula, setFormula] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!formula.trim()) { setPreview(""); setError(""); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const katex = (await import("katex")).default;
        const html = katex.renderToString(formula, { throwOnError: true, displayMode: true });
        setPreview(html);
        setError("");
      } catch (e: any) {
        setPreview("");
        setError(e.message || "Geçersiz formül");
      }
    }, 300);
  }, [formula]);

  const handleInsert = async () => {
    if (!editor || !formula.trim()) return;
    try {
      const katex = (await import("katex")).default;
      const html = katex.renderToString(formula, { throwOnError: true, displayMode: true });
      const wrapped = `<span class="math-formula" data-formula="${encodeURIComponent(formula)}">${html}</span>`;
      editor.chain().focus().insertContent(wrapped).run();
      setFormula("");
      onClose();
    } catch {}
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={() => { setFormula(""); onClose(); }}>
      <div className="modal-card" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Matematik Formülü Ekle</span>
          <button className="modal-close" onClick={() => { setFormula(""); onClose(); }}><X size={14} /></button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EXAMPLES.map(ex => (
              <button
                key={ex.label}
                className="btn ghost"
                style={{ fontSize: 11, padding: "3px 10px", height: "auto" }}
                onClick={() => setFormula(ex.formula)}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <textarea
            className="editor-tags-input"
            style={{ width: "100%", boxSizing: "border-box", height: 80, fontFamily: "monospace", resize: "none" }}
            placeholder="LaTeX formülü girin... (ör: \\frac{1}{2})"
            value={formula}
            onChange={e => setFormula(e.target.value)}
          />

          {preview && (
            <div
              style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8, textAlign: "center", overflowX: "auto", background: "var(--bg-subtle)" }}
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          )}
          {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}

          <button
            className="btn primary"
            style={{ width: "100%" }}
            onClick={() => void handleInsert()}
            disabled={!formula.trim() || !!error}
          >
            Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
