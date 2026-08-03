import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, type EditorView } from '@codemirror/view';

// Map heading levels to their specific decoration classes
const headingUnderlineDecos: Record<number, Decoration> = {
  1: Decoration.mark({ class: 'cm-heading-ul-1' }),
  2: Decoration.mark({ class: 'cm-heading-ul-2' }),
  3: Decoration.mark({ class: 'cm-heading-ul-3' }),
  4: Decoration.mark({ class: 'cm-heading-ul-4' }),
  5: Decoration.mark({ class: 'cm-heading-ul-5' }),
  6: Decoration.mark({ class: 'cm-heading-ul-6' }),
};

export const headingUnderlinePlugin = ViewPlugin.fromClass(class {
  decorations;

  constructor(view: EditorView) {
    this.decorations = this.buildDeco(view);
  }

  update(update: any) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDeco(update.view);
    }
  }

  buildDeco(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter(node) {
          if (node.name.startsWith('ATXHeading') || node.name.startsWith('SetextHeading')) {
            const mark = node.node.getChild('HeaderMark');
            if (mark) {
              // Extract heading level (1-6) from node.name, defaulting to 1
              const levelMatch = node.name.match(/\d$/);
              const level = levelMatch ? parseInt(levelMatch[0], 10) : 1;
              const deco = headingUnderlineDecos[level] || headingUnderlineDecos[1];

              // Find the space and decorate the text after it
              const textStr = view.state.doc.sliceString(mark.to, node.to);
              const match = textStr.match(/^(\s+)(.*)$/);
              if (match && match[2].length > 0) {
                const textStart = mark.to + match[1].length;
                builder.add(textStart, node.to, deco);
              }
            } else if (node.name.startsWith('SetextHeading')) {
              const levelMatch = node.name.match(/\d$/);
              const level = levelMatch ? parseInt(levelMatch[0], 10) : 1;
              const deco = headingUnderlineDecos[level] || headingUnderlineDecos[1];

              // For Setext headings, the mark is at the end (the ====== or ------ line)
              // We just match the text before the newline
              const textStr = view.state.doc.sliceString(node.from, node.to);
              const match = textStr.match(/^(.+?)\n/);
              if (match && match[1].trim().length > 0) {
                const end = node.from + match[1].length;
                builder.add(node.from, end, deco);
              }
            }
          }
        }
      });
    }

    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});
