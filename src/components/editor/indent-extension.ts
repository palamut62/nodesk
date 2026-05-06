import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const INDENT_SIZE = 24;
const MAX_INDENT = 8;
const BLOCK_TYPES = ['paragraph', 'heading', 'blockquote'];

export const IndentExtension = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          indent: {
            default: 0,
            parseHTML: el => {
              const pl = (el as HTMLElement).style.paddingLeft;
              return pl ? Math.round(parseInt(pl, 10) / INDENT_SIZE) : 0;
            },
            renderHTML: attrs => {
              if (!attrs.indent) return {};
              return { style: `padding-left: ${attrs.indent * INDENT_SIZE}px` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (BLOCK_TYPES.includes(node.type.name)) {
              const cur = (node.attrs.indent as number) ?? 0;
              const next = Math.min(cur + 1, MAX_INDENT);
              if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            }
          });
          if (dispatch) dispatch(tr);
          return true;
        },
      outdent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (BLOCK_TYPES.includes(node.type.name)) {
              const cur = (node.attrs.indent as number) ?? 0;
              const next = Math.max(cur - 1, 0);
              if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            }
          });
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});
