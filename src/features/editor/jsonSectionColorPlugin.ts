import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

const JSON_SECTION_COUNT = 6;

const sectionDecorations = Array.from({ length: JSON_SECTION_COUNT }, (_, index) =>
  Decoration.mark({ class: `cm-json-section cm-json-section-${index}` }),
);

const headerDecoration = Decoration.mark({ class: 'cm-json-header' });
const fieldDecoration = Decoration.mark({ class: 'cm-json-field' });
const stringDecoration = Decoration.mark({ class: 'cm-json-string' });
const numberDecoration = Decoration.mark({ class: 'cm-json-number' });
const booleanDecoration = Decoration.mark({ class: 'cm-json-boolean' });
const nullDecoration = Decoration.mark({ class: 'cm-json-null' });
const braceDecoration = Decoration.mark({ class: 'cm-json-brace' });
const punctuationDecoration = Decoration.mark({ class: 'cm-json-punctuation' });

const sectionValueNodeNames = new Set(['Property', 'Object', 'Array', 'String', 'Number', 'True', 'False', 'Null']);
const braceNodeNames = new Set(['{', '}', '[', ']']);
const punctuationNodeNames = new Set([':', ',']);

function getSectionIndex(index: number): number {
  return ((index % JSON_SECTION_COUNT) + JSON_SECTION_COUNT) % JSON_SECTION_COUNT;
}

function getNestedSectionStart(sectionIndex: number): number {
  return getSectionIndex(sectionIndex + 1);
}

function forEachChild(node: SyntaxNode, visit: (child: SyntaxNode) => void) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    visit(child);
  }
}

function addDecoration(builder: RangeSetBuilder<Decoration>, from: number, to: number, decoration: Decoration) {
  if (from < to) {
    builder.add(from, to, decoration);
  }
}

function addSectionDecoration(builder: RangeSetBuilder<Decoration>, node: SyntaxNode, sectionIndex: number) {
  addDecoration(builder, node.from, node.to, sectionDecorations[getSectionIndex(sectionIndex)]);
}

function decorateScalarValue(node: SyntaxNode, builder: RangeSetBuilder<Decoration>) {
  switch (node.name) {
    case 'PropertyName':
      addDecoration(builder, node.from, node.to, fieldDecoration);
      return;
    case 'String':
      addDecoration(builder, node.from, node.to, stringDecoration);
      return;
    case 'Number':
      addDecoration(builder, node.from, node.to, numberDecoration);
      return;
    case 'True':
    case 'False':
      addDecoration(builder, node.from, node.to, booleanDecoration);
      return;
    case 'Null':
      addDecoration(builder, node.from, node.to, nullDecoration);
      return;
    default:
      if (braceNodeNames.has(node.name)) {
        addDecoration(builder, node.from, node.to, braceDecoration);
        return;
      }

      if (punctuationNodeNames.has(node.name)) {
        addDecoration(builder, node.from, node.to, punctuationDecoration);
        return;
      }

      forEachChild(node, (child) => decorateScalarValue(child, builder));
  }
}

function decoratePropertyValue(node: SyntaxNode, builder: RangeSetBuilder<Decoration>, sectionIndex: number) {
  if (node.name === 'Object') {
    decorateObjectSections(node, builder, getNestedSectionStart(sectionIndex));
    return;
  }

  if (node.name === 'Array') {
    decorateArraySections(node, builder, getNestedSectionStart(sectionIndex));
    return;
  }

  decorateScalarValue(node, builder);
}

function decorateProperty(node: SyntaxNode, builder: RangeSetBuilder<Decoration>, isSectionHeader: boolean, sectionIndex: number) {
  forEachChild(node, (child) => {
    if (child.name === 'PropertyName') {
      addDecoration(builder, child.from, child.to, isSectionHeader ? headerDecoration : fieldDecoration);
      return;
    }

    if (punctuationNodeNames.has(child.name)) {
      addDecoration(builder, child.from, child.to, punctuationDecoration);
      return;
    }

    decoratePropertyValue(child, builder, sectionIndex);
  });
}

function decorateObjectInSection(node: SyntaxNode, builder: RangeSetBuilder<Decoration>, sectionIndex: number) {
  forEachChild(node, (child) => {
    if (child.name === 'Property') {
      decorateProperty(child, builder, false, sectionIndex);
      return;
    }

    if (braceNodeNames.has(child.name)) {
      addDecoration(builder, child.from, child.to, braceDecoration);
      return;
    }

    if (punctuationNodeNames.has(child.name)) {
      addDecoration(builder, child.from, child.to, punctuationDecoration);
    }
  });
}

function decorateSectionValue(node: SyntaxNode, builder: RangeSetBuilder<Decoration>, sectionIndex: number) {
  switch (node.name) {
    case 'Object':
      decorateObjectInSection(node, builder, sectionIndex);
      return;
    case 'Array':
      decorateArraySections(node, builder, getNestedSectionStart(sectionIndex));
      return;
    default:
      decorateScalarValue(node, builder);
  }
}

function getRootValueNode(view: EditorView): SyntaxNode | null {
  const root = syntaxTree(view.state).topNode;

  for (let child = root.firstChild; child; child = child.nextSibling) {
    if (sectionValueNodeNames.has(child.name)) {
      return child;
    }
  }

  return null;
}

function decorateObjectSections(node: SyntaxNode, builder: RangeSetBuilder<Decoration>, startSectionIndex = 0) {
  let sectionOffset = 0;

  forEachChild(node, (child) => {
    if (child.name === 'Property') {
      const sectionIndex = getSectionIndex(startSectionIndex + sectionOffset);
      addSectionDecoration(builder, child, sectionIndex);
      decorateProperty(child, builder, true, sectionIndex);
      sectionOffset += 1;
      return;
    }

    if (braceNodeNames.has(child.name)) {
      addDecoration(builder, child.from, child.to, braceDecoration);
      return;
    }

    if (punctuationNodeNames.has(child.name)) {
      addDecoration(builder, child.from, child.to, punctuationDecoration);
    }
  });
}

function decorateArraySections(node: SyntaxNode, builder: RangeSetBuilder<Decoration>, startSectionIndex = 0) {
  let sectionOffset = 0;

  forEachChild(node, (child) => {
    if (sectionValueNodeNames.has(child.name)) {
      const sectionIndex = getSectionIndex(startSectionIndex + sectionOffset);
      addSectionDecoration(builder, child, sectionIndex);
      decorateSectionValue(child, builder, sectionIndex);
      sectionOffset += 1;
      return;
    }

    if (braceNodeNames.has(child.name)) {
      addDecoration(builder, child.from, child.to, braceDecoration);
      return;
    }

    if (punctuationNodeNames.has(child.name)) {
      addDecoration(builder, child.from, child.to, punctuationDecoration);
    }
  });
}

function buildDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const rootValue = getRootValueNode(view);

  if (!rootValue) {
    return builder.finish();
  }

  if (rootValue.name === 'Object') {
    decorateObjectSections(rootValue, builder);
    return builder.finish();
  }

  if (rootValue.name === 'Array') {
    decorateArraySections(rootValue, builder);
    return builder.finish();
  }

  addSectionDecoration(builder, rootValue, 0);
  decorateSectionValue(rootValue, builder, 0);
  return builder.finish();
}

export const jsonSectionColorPlugin = ViewPlugin.fromClass(class {
  decorations;

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged
      || update.viewportChanged
      || syntaxTree(update.startState) !== syntaxTree(update.state)
    ) {
      this.decorations = buildDecorations(update.view);
    }
  }
}, {
  decorations: (plugin) => plugin.decorations,
});