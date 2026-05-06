import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface WikiLinkOptions {
  getNoteByTitle: (title: string) => { id: string } | undefined;
  onLinkClick: (noteId: string) => void;
}

export const WikiLinkExtension = Extension.create<WikiLinkOptions>({
  name: 'wikiLink',

  addOptions() {
    return {
      getNoteByTitle: () => undefined,
      onLinkClick: () => {},
    };
  },

  addProseMirrorPlugins() {
    const { getNoteByTitle, onLinkClick } = this.options;

    return [
      new Plugin({
        key: new PluginKey('wikiLink'),
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            const re = /\[\[([^\]]+)\]\]/g;
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              let m: RegExpExecArray | null;
              re.lastIndex = 0;
              while ((m = re.exec(node.text)) !== null) {
                const from = pos + m.index;
                const to = from + m[0].length;
                const title = m[1];
                const note = getNoteByTitle(title);
                decos.push(
                  Decoration.inline(from, to, {
                    class: note ? 'wiki-link wiki-link-exists' : 'wiki-link wiki-link-new',
                    'data-wiki-title': title,
                    'data-note-id': note?.id ?? '',
                  })
                );
              }
            });
            return DecorationSet.create(state.doc, decos);
          },

          handleClick(view, _pos, event) {
            const target = event.target as HTMLElement;
            if (target.classList.contains('wiki-link')) {
              const noteId = target.getAttribute('data-note-id');
              if (noteId) {
                onLinkClick(noteId);
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
