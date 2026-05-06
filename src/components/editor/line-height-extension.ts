import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

const BLOCK_TYPES = ['paragraph', 'heading'];

export const LineHeightExtension = Extension.create({
  name: 'lineHeight',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: el => (el as HTMLElement).style.lineHeight || null,
            renderHTML: attrs => {
              if (!attrs.lineHeight) return {};
              return { style: `line-height: ${attrs.lineHeight}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (BLOCK_TYPES.includes(node.type.name)) {
              if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight });
            }
          });
          if (dispatch) dispatch(tr);
          return true;
        },
      unsetLineHeight:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (BLOCK_TYPES.includes(node.type.name)) {
              const attrs = { ...node.attrs };
              delete attrs.lineHeight;
              if (dispatch) tr.setNodeMarkup(pos, undefined, attrs);
            }
          });
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});
