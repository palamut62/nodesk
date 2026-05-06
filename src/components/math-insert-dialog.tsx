import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Editor } from '@tiptap/react';
import { useT } from '@/lib/use-t';

interface Props {
  open: boolean;
  onClose: () => void;
  editor: Editor | null;
}

const EXAMPLES = [
  { labelKey: 'math.ex.sqrt'    as const, formula: '\\sqrt{x^2 + y^2}' },
  { labelKey: 'math.ex.frac'    as const, formula: '\\frac{a}{b}' },
  { labelKey: 'math.ex.int'     as const, formula: '\\int_0^\\infty e^{-x} dx' },
  { labelKey: 'math.ex.sigma'   as const, formula: '\\sum_{i=1}^{n} x_i' },
  { labelKey: 'math.ex.matrix'  as const, formula: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { labelKey: 'math.ex.limit'   as const, formula: '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1' },
];

export function MathInsertDialog({ open, onClose, editor }: Props) {
  const t = useT();
  const [formula, setFormula] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!formula.trim()) { setPreview(''); setError(''); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const katex = (await import('katex')).default;
        const html = katex.renderToString(formula, { throwOnError: true, displayMode: true });
        setPreview(html);
        setError('');
      } catch (e: any) {
        setPreview('');
        setError(e.message || t('math.invalid'));
      }
    }, 300);
  }, [formula]);

  const handleInsert = async () => {
    if (!editor || !formula.trim()) return;
    try {
      const katex = (await import('katex')).default;
      const html = katex.renderToString(formula, { throwOnError: true, displayMode: true });
      const wrapped = `<span class="math-formula" data-formula="${encodeURIComponent(formula)}">${html}</span>`;
      editor.chain().focus().insertContent(wrapped).run();
      setFormula('');
      onClose();
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={() => { setFormula(''); onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('math.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map(ex => (
              <button
                key={ex.labelKey}
                className="px-2 py-1 text-xs border border-border rounded-md hover:bg-accent transition-colors"
                onClick={() => setFormula(ex.formula)}
              >
                {t(ex.labelKey)}
              </button>
            ))}
          </div>

          <textarea
            className="w-full px-3 py-2 text-sm font-mono border border-border rounded-md bg-background outline-none focus:ring-1 focus:ring-primary resize-none h-20"
            placeholder={t('math.placeholder')}
            value={formula}
            onChange={e => setFormula(e.target.value)}
          />

          {preview && (
            <div
              className="p-3 border border-border rounded-md bg-accent/20 text-center overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          )}
          {error && <div className="text-xs text-destructive">{error}</div>}

          <Button className="w-full" onClick={handleInsert} disabled={!formula.trim() || !!error}>
            {t('math.insert')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
