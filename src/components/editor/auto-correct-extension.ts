import { Extension } from '@tiptap/core';
import { fixWord } from '@/lib/ai';
import type { AiProvider } from '@/lib/types';

export interface AutoCorrectOptions {
  getSettings: () => {
    enabled: boolean;
    provider: AiProvider;
    apiKey: string;
    model: string;
  };
  onCorrecting?: (word: string) => void;
  onCorrected?: (original: string, corrected: string) => void;
}

export const AutoCorrectExtension = Extension.create<AutoCorrectOptions>({
  name: 'autoCorrect',

  addOptions() {
    return {
      getSettings: () => ({ enabled: false, provider: 'openrouter', apiKey: '', model: '' }),
    };
  },

  addKeyboardShortcuts() {
    return {
      Space: () => {
        const settings = this.options.getSettings();
        if (!settings.enabled || !settings.apiKey || !settings.model) return false;

        const { state } = this.editor;
        const { from } = state.selection;

        const lookback = Math.max(0, from - 200);
        const textBefore = state.doc.textBetween(lookback, from, ' ');
        const match = textBefore.match(/(\S+)$/);
        if (!match || match[1].length < 2) return false;

        const word = match[1];
        // Only correct likely Turkish words (letters only, no special chars)
        if (!/^[a-züğışöçA-ZÜĞİŞÖÇ'-]+$/.test(word)) return false;

        const wordStart = from - word.length;
        const wordEnd = from;

        // Let the space insert normally, then async-correct the word
        setTimeout(async () => {
          this.options.onCorrecting?.(word);
          try {
            const corrected = await fixWord(word, settings.provider, settings.apiKey, settings.model);
            if (corrected && corrected !== word) {
              // After space insertion wordStart/wordEnd positions are still valid
              // (space was inserted at wordEnd, pushing everything after it)
              const docSize = this.editor.state.doc.content.size;
              if (wordStart < 0 || wordEnd > docSize) return;

              // Verify text at that range still matches our word
              const currentText = this.editor.state.doc.textBetween(wordStart, wordEnd, ' ');
              if (currentText !== word) return;

              this.editor
                .chain()
                .setTextSelection({ from: wordStart, to: wordEnd })
                .insertContent(corrected)
                .setTextSelection(wordStart + corrected.length + 1) // +1 for space
                .run();

              this.options.onCorrected?.(word, corrected);
            }
          } catch {}
        }, 0);

        return false; // let space insert normally
      },
    };
  },
});
