import { Node, mergeAttributes } from '@tiptap/core';

export type CalloutType = 'info' | 'warning' | 'success' | 'danger';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (calloutType?: CalloutType) => ReturnType;
    };
  }
}

export const CalloutExtension = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      calloutType: {
        default: 'info',
        parseHTML: (element) => element.getAttribute('data-callout-type') ?? 'info',
        renderHTML: (attrs) => ({ 'data-callout-type': attrs.calloutType }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const ctype = (HTMLAttributes['data-callout-type'] as string) || 'info';
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-callout': '',
        class: `callout callout-${ctype}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertCallout:
        (calloutType: CalloutType = 'info') =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { calloutType },
            content: [{ type: 'paragraph' }],
          });
        },
    };
  },
});
