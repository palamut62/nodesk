import { Extension, markInputRule } from '@tiptap/core';

export const MarkdownShortcutsExtension = Extension.create({
  name: 'markdownShortcuts',

  addInputRules() {
    const { schema } = this.editor;
    const highlightType = schema.marks.highlight;
    if (!highlightType) return [];
    return [
      markInputRule({
        find: /==([^=]+)==$/,
        type: highlightType,
        getAttributes: () => ({ color: '#fef08a' }),
      }),
    ];
  },
});
