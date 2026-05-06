import { useState, useRef, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { X, ChevronUp, ChevronDown, Replace } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  editor: Editor | null;
  onClose: () => void;
}

export function FindReplace({ editor, onClose }: Props) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);
  const matchesRef = useRef<{ from: number; to: number }[]>([]);

  useEffect(() => {
    findRef.current?.focus();
  }, []);

  const findMatches = useCallback((text: string) => {
    if (!editor || !text) {
      setMatchCount(0);
      setCurrentMatch(0);
      matchesRef.current = [];
      return [];
    }
    const content = editor.getText();
    const flags = caseSensitive ? 'g' : 'gi';
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, flags);
    const matches: { from: number; to: number }[] = [];
    let match;
    let charOffset = 0;
    editor.state.doc.forEach((node) => {
      if (node.isText && node.text) {
        regex.lastIndex = 0;
        while ((match = regex.exec(node.text)) !== null) {
          matches.push({ from: charOffset + match.index + 1, to: charOffset + match.index + text.length + 1 });
        }
        charOffset += node.nodeSize;
      }
    });
    matchesRef.current = matches;
    setMatchCount(matches.length);
    return matches;
  }, [editor, caseSensitive]);

  useEffect(() => {
    findMatches(findText);
    setCurrentMatch(findText ? 1 : 0);
  }, [findText, caseSensitive, findMatches]);

  const goToMatch = (index: number) => {
    const matches = matchesRef.current;
    if (!editor || matches.length === 0) return;
    const m = matches[index];
    if (m) {
      editor.commands.setTextSelection({ from: m.from, to: m.to });
      editor.commands.focus();
    }
  };

  const findNext = () => {
    const matches = matchesRef.current;
    if (matches.length === 0) return;
    const next = currentMatch >= matches.length ? 1 : currentMatch + 1;
    setCurrentMatch(next);
    goToMatch(next - 1);
  };

  const findPrev = () => {
    const matches = matchesRef.current;
    if (matches.length === 0) return;
    const prev = currentMatch <= 1 ? matches.length : currentMatch - 1;
    setCurrentMatch(prev);
    goToMatch(prev - 1);
  };

  const handleReplace = () => {
    if (!editor || !findText) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to);
    const match = caseSensitive
      ? selected === findText
      : selected.toLowerCase() === findText.toLowerCase();
    if (match) {
      editor.commands.insertContentAt({ from, to }, replaceText);
    }
    findNext();
  };

  const handleReplaceAll = () => {
    if (!editor || !findText) return;
    const html = editor.getHTML();
    const flags = caseSensitive ? 'g' : 'gi';
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const replaced = html.replace(new RegExp(escaped, flags), replaceText);
    editor.commands.setContent(replaced);
    findMatches(findText);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') findNext();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="find-replace-bar">
      <div className="find-replace-row">
        <input
          ref={findRef}
          className="find-input"
          placeholder="Bul..."
          value={findText}
          onChange={e => setFindText(e.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="input-find"
        />
        <span className="find-count">
          {matchCount > 0 ? `${currentMatch}/${matchCount}` : findText ? '0/0' : ''}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={findPrev} disabled={matchCount === 0} title="Önceki">
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={findNext} disabled={matchCount === 0} title="Sonraki">
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <label className="find-case-label" title="Büyük/küçük harf duyarlı">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={e => setCaseSensitive(e.target.checked)}
            className="mr-1"
          />
          Aa
        </label>
      </div>

      <div className="find-replace-row">
        <input
          className="find-input"
          placeholder="Değiştir..."
          value={replaceText}
          onChange={e => setReplaceText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
          data-testid="input-replace"
        />
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleReplace} disabled={!findText}>
          Değiştir
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleReplaceAll} disabled={!findText}>
          Tümünü Değiştir
        </Button>
      </div>

      <Button variant="ghost" size="icon" className="h-7 w-7 self-start mt-0.5" onClick={onClose} title="Kapat">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
