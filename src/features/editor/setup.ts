// ============================================================
// PrismPane — CodeMirror 6 Editor Configuration
// ============================================================

import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { type Command, EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder, scrollPastEnd } from '@codemirror/view';
import { defaultKeymap, deleteLine, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { closeBrackets, acceptCompletion } from '@codemirror/autocomplete';
import { linter, lintGutter } from '@codemirror/lint';
import { highlightSelectionMatches, search } from '@codemirror/search';
import type { AppSettings, EditorDocumentType } from '../../types';
import { smartListKeymap } from './listExtension';
import { jsonSectionColorPlugin } from './jsonSectionColorPlugin';
import { jsonObjectAddWidgetPlugin } from './jsonObjectAddWidgetPlugin';
import { createThemeExtension } from './themeExtension';
import { headingUnderlinePlugin } from './headingUnderlinePlugin';
import { createColorPickerPlugin, type OnColorSwatchClick } from './colorPickerPlugin';
import { createIconHelperPlugin, type OnIconPickerClick } from './iconHelperPlugin';

function createJsonFoldMarker(open: boolean): HTMLElement {
  const marker = document.createElement('span');
  marker.className = `cm-foldButton ${open ? 'cm-foldButton--open' : 'cm-foldButton--closed'}`;
  marker.textContent = open ? '−' : '+';
  marker.title = open ? 'Collapse section' : 'Expand section';
  marker.setAttribute('aria-hidden', 'true');
  return marker;
}

function getSelectedLineTexts(view: EditorView): string[] | null {
  if (view.state.selection.ranges.some((range) => !range.empty)) {
    return null;
  }

  const seenLines = new Set<number>();
  const lines: string[] = [];

  for (const range of view.state.selection.ranges) {
    const line = view.state.doc.lineAt(range.head);
    if (seenLines.has(line.number)) continue;

    seenLines.add(line.number);
    lines.push(line.text);
  }

  return lines;
}

function createInsertLineCommand(position: 'above' | 'below'): Command {
  return (view) => {
    const { state } = view;
    const seenLines = new Set<number>();
    const insertPositions: number[] = [];

    // Insert once per selected line, even when the selection has multiple cursors.
    for (const range of state.selection.ranges) {
      const line = state.doc.lineAt(range.head);
      if (seenLines.has(line.number)) continue;

      seenLines.add(line.number);
      insertPositions.push(position === 'above' ? line.from : line.to);
    }

    insertPositions.sort((left, right) => left - right);

    const countInsertionsBefore = (positionToCheck: number, inclusive: boolean) => insertPositions.reduce(
      (count, insertPosition) => count + ((inclusive ? insertPosition <= positionToCheck : insertPosition < positionToCheck) ? 1 : 0),
      0,
    );

    view.dispatch({
      changes: insertPositions.map((insertPosition) => ({ from: insertPosition, insert: '\n' })),
      selection: EditorSelection.create(state.selection.ranges.map((range) => {
        const anchorOffset = countInsertionsBefore(range.anchor, position === 'above');
        const headOffset = countInsertionsBefore(range.head, position === 'above');

        return EditorSelection.range(range.anchor + anchorOffset, range.head + headOffset);
      })),
      scrollIntoView: true,
    });

    return true;
  };
}

export const copyCurrentLine: Command = (view) => {
  const lines = getSelectedLineTexts(view);
  if (!lines || !navigator.clipboard?.writeText) {
    return false;
  }

  void navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
  return true;
};

export const cutCurrentLine: Command = (view) => {
  const lines = getSelectedLineTexts(view);
  if (!lines || !navigator.clipboard?.writeText) {
    return false;
  }

  void navigator.clipboard.writeText(lines.join('\n')).then(() => {
    deleteLine(view);
  }).catch(() => {});

  return true;
};

export const insertLineAbove = createInsertLineCommand('above');
export const insertLineBelow = createInsertLineCommand('below');
export const deleteCurrentLine = deleteLine;

const prismPaneKeymap = [
  { key: 'Mod-c', run: copyCurrentLine },
  { key: 'Mod-x', run: cutCurrentLine },
  { key: 'Mod-Enter', run: insertLineBelow },
  { key: 'Shift-Mod-Enter', run: insertLineAbove },
];

/**
 * Build the full set of CodeMirror extensions from app settings.
 */
export function createEditorExtensions(
  settings: AppSettings,
  documentType: EditorDocumentType = 'markdown',
  extraExtensions: Extension[] = [],
  onOpenColorPicker?: OnColorSwatchClick,
  onOpenIconPicker?: OnIconPickerClick,
): Extension[] {
  const indentSize = documentType === 'json' ? settings.jsonIndentSize : settings.tabSize;
  const gutterExtensions: Extension[] = [];

  if (settings.showLineNumbers) {
    gutterExtensions.push(lineNumbers());
  }

  if (documentType === 'json' && settings.showJsonFoldGutter) {
    gutterExtensions.push(foldGutter({ markerDOM: createJsonFoldMarker }));
  }

  const exts: Extension[] = [
    // Core editor behavior comes first so later extensions can build on it.
    EditorState.tabSize.of(indentSize),
    indentUnit.of(' '.repeat(indentSize)),
    EditorView.contentAttributes.of({ spellcheck: 'true' }),
    ...gutterExtensions,
    highlightActiveLineGutter(),
    ...(settings.showActiveLine ? [highlightActiveLine()] : []),
    drawSelection(),
    history(),
    closeBrackets(),
    bracketMatching(),
    highlightSelectionMatches(),
    search({ top: true }),
    placeholder(documentType === 'json' ? 'Start typing JSON...' : 'Start typing Markdown...'),

    // App-specific shortcuts run before the default keymaps.
    keymap.of(prismPaneKeymap),
    keymap.of([...defaultKeymap, ...historyKeymap, ...(documentType === 'json' ? foldKeymap : [])]),
    keymap.of([indentWithTab]),
    keymap.of([{ key: 'Tab', run: acceptCompletion }]),

    // Theme is injected before syntax highlighting so colors stay consistent.
    createThemeExtension(settings),

    // Syntax highlighting is the base layer for both document types.
    syntaxHighlighting(defaultHighlightStyle),

    // Let the underlying editable surface participate in OS/browser text services.
    EditorView.contentAttributes.of({
      spellcheck: settings.spellCheck ? 'true' : 'false',
      autocorrect: settings.spellCheck ? 'on' : 'off',
      autocomplete: settings.spellCheck ? 'on' : 'off',
      lang: 'en-US',
    }),
  ];

  if (onOpenColorPicker) {
    exts.push(createColorPickerPlugin(onOpenColorPicker));
  }

  const activeIconPackage = documentType === 'json' ? settings.iconHelperJsonPackage : settings.iconHelperMdPackage;
  if (activeIconPackage && activeIconPackage !== 'off' && onOpenIconPicker) {
    exts.push(createIconHelperPlugin(activeIconPackage, onOpenIconPicker));
  }

  if (documentType === 'json') {
    exts.push(
      json(),
      indentOnInput(),
      jsonSectionColorPlugin,
      jsonObjectAddWidgetPlugin,
    );

    exts.push(
      linter(jsonParseLinter()),
    );
  } else {
    exts.push(
      smartListKeymap,
      markdown({
        base: markdownLanguage,
        codeLanguages: [],
      }),
      headingUnderlinePlugin,
    );
  }

  // Word wrap is optional and enabled per user preference.
  if (settings.wordWrap) {
    exts.push(EditorView.lineWrapping);
  }

  // Typewriter mode keeps the active line centered while editing.
  if (settings.typewriterMode) {
    exts.push(scrollPastEnd());
    exts.push(
      EditorState.transactionExtender.of((tr) => {
        if (tr.docChanged || tr.selection) {
          return {
            effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: 'center' })
          };
        }
        return null;
      })
    );
  }

  // Callers can append additional extensions last.
  exts.push(...extraExtensions);

  return exts;
}

/**
 * Create an EditorState pre-loaded with content and extensions.
 */
export function createEditorState(
  doc: string,
  settings: AppSettings,
  documentType: EditorDocumentType = 'markdown',
  extraExtensions: Extension[] = [],
  initialCursorPos: number = 0,
  onOpenColorPicker?: OnColorSwatchClick,
  onOpenIconPicker?: OnIconPickerClick,
): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: Math.min(initialCursorPos, doc.length) },
    extensions: createEditorExtensions(settings, documentType, extraExtensions, onOpenColorPicker, onOpenIconPicker),
  });
}