// ============================================================
// PrismPane — Smart List Continuation (CodeMirror 6 Keymap)
// ============================================================

import { EditorView, keymap, type Command } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import {
  getListTypeInfo,
  isEmptyListItem,
  clearListMarker,
  indentListLine,
  unindentListLine,
  getNextOrderedNumber,
} from '../formatters/blockTransforms';

/**
 * Custom Enter handler that implements smart list behavior:
 * 1. If the cursor is inside a list item (ordered or unordered), the new
 *    line automatically prepends the appropriate marker.
 * 2. For ordered lists, the number increments based on the previous item
 *    at the same indent level.
 * 3. If the current line contains ONLY the list marker (user pressed Enter
 *    twice), the marker is cleared instead of continued — effectively
 *    "breaking out" of the list.
 */
const smartNewline: Command = (view: EditorView): boolean => {
  const { state } = view;
  const { selection } = state;

  // We only handle single cursors (no multiple selection)
  if (selection.ranges.length !== 1) return false;

  const range = selection.main;
  const pos = range.from;

  // Get the current line
  const line = state.doc.lineAt(pos);
  const lineText = line.text;

  // Check if the cursor is at end of line (or there's no selection covering multiple lines)
  const cursorAtEndOfLine = pos === line.to;
  const selectionIsSingleLine = range.from === range.to || (
    range.from >= line.from && range.to <= line.to
  );

  // Detect list type info
  const listInfo = getListTypeInfo(lineText);

  // If no list marker found, use default Enter behavior
  if (!listInfo) return false;

  // If the line is an empty list item, clear the marker instead of continuing
  if (isEmptyListItem(lineText) && cursorAtEndOfLine) {
    view.dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: clearListMarker(lineText),
      },
      selection: EditorSelection.cursor(line.from + clearListMarker(lineText).length),
      userEvent: 'input.breakList',
    });
    return true;
  }

  // Smart continuation: prepend the correct list marker to the new line
  let newMarker: string;
  if (listInfo.isOrdered) {
    // Get the next number for this indent level
    // Collect all lines into an array for getNextOrderedNumber
    const allLines: string[] = [];
    const iter = state.doc.iterLines();
    while (true) {
      const entry = iter.next();
      if (entry.done) break;
      allLines.push(entry.value);
    }
    const nextNum = getNextOrderedNumber(
      allLines,
      line.number - 1,
      listInfo.indent.length,
    );
    newMarker = `${nextNum}. `;
  } else {
    newMarker = listInfo.marker;
  }

  // Compute the insertion string for the new line (preserve indentation)
  const newLineContent = `${listInfo.indent}${newMarker}`;

  // Exact position of the newline character(s) at end of this line.
  // line.text excludes the newline, so line.from + line.text.length
  // is the position right before \n.
  const newlinePos = line.from + line.text.length;

  // Handle different cursor scenarios
  if (cursorAtEndOfLine && selectionIsSingleLine) {
    // Cursor at end of line: normal Enter with marker prepended.
    // Replace the existing \n (from newlinePos to line.to) with
    // \n + newLineContent to avoid ever inserting two \n's in a row.
    view.dispatch({
      changes: { from: newlinePos, to: line.to, insert: `\n${newLineContent}` },
      selection: EditorSelection.cursor(newlinePos + 1 + newLineContent.length),
      userEvent: 'input.continueList',
    });
    return true;
  } else if (range.empty) {
    // Cursor mid-line: split line and continue marker on new line.
    // Replace from cursor to end-of-line-newline with the split content.
    const afterCursor = lineText.slice(pos - line.from);
    view.dispatch({
      changes: { from: pos, to: line.to, insert: `\n${newLineContent}${afterCursor}` },
      selection: EditorSelection.cursor(pos + 1 + newLineContent.length),
      userEvent: 'input.continueList',
    });
    return true;
  }

  // Fallback to default behavior
  return false;
};

/**
 * Backspace handler: when at the start of an empty list item,
 * delete the entire line (remove the marker + line break).
 */
const smartBackspace: Command = (view: EditorView): boolean => {
  const { state } = view;
  const { selection } = state;

  if (selection.ranges.length !== 1) return false;
  const range = selection.main;
  if (!range.empty) return false;

  const pos = range.from;
  const line = state.doc.lineAt(pos);
  const lineText = line.text;

  // Only trigger at the start of a line
  if (pos !== line.from) return false;

  // If the line is an empty list item, delete it
  if (!isEmptyListItem(lineText)) return false;

  // Delete this line: remove from previous line's end (or start if first line)
  const from = line.number > 1
    ? state.doc.line(line.number - 1).to
    : line.from;
  const to = line.to;

  view.dispatch({
    changes: { from, to },
    selection: EditorSelection.cursor(from),
    userEvent: 'delete.clearList',
  });
  return true;
};

/**
 * Tab handler: when the cursor is on a list line (ordered or unordered),
 * indent the entire line. This works even when text is selected across
 * multiple list lines — all selected lines get indented.
 */
const indentListItem: Command = (view: EditorView): boolean => {
  const { state } = view;
  const { selection } = state;

  const changes: { from: number; to: number; insert: string }[] = [];
  const processedLines = new Set<number>();
  let newHead = selection.main.head;

  for (const range of selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);

    let hasListLine = false;
    for (let i = fromLine.number; i <= toLine.number; i++) {
      if (processedLines.has(i)) continue;
      const line = state.doc.line(i);
      // Only handle lines that are part of a list
      if (getListTypeInfo(line.text)) {
        hasListLine = true;
        processedLines.add(i);
        const newText = indentListLine(line.text);
        changes.push({
          from: line.from,
          to: line.to,
          insert: newText,
        });
        if (range === selection.main && i === fromLine.number) {
          newHead = line.from + newText.length;
        }
      }
    }

    // If no list lines found in this range, fall through to default Tab behavior
    if (!hasListLine) return false;
  }

  if (changes.length > 0) {
    view.dispatch({
      changes,
      selection: EditorSelection.cursor(newHead),
      userEvent: 'input.indentList',
    });
    return true;
  }

  return false;
};

/**
 * Shift-Tab handler: un-indents list lines.
 */
const unindentListItem: Command = (view: EditorView): boolean => {
  const { state } = view;
  const { selection } = state;

  const changes: { from: number; to: number; insert: string }[] = [];
  const processedLines = new Set<number>();
  let newHead = selection.main.head;

  for (const range of selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);

    let hasListLine = false;
    for (let i = fromLine.number; i <= toLine.number; i++) {
      if (processedLines.has(i)) continue;
      const line = state.doc.line(i);
      if (getListTypeInfo(line.text)) {
        hasListLine = true;
        processedLines.add(i);
        const newText = unindentListLine(line.text);
        changes.push({
          from: line.from,
          to: line.to,
          insert: newText,
        });
        if (range === selection.main && i === fromLine.number) {
          newHead = line.from + newText.length;
        }
      }
    }

    if (!hasListLine) return false;
  }

  if (changes.length > 0) {
    view.dispatch({
      changes,
      selection: EditorSelection.cursor(newHead),
      userEvent: 'input.unindentList',
    });
    return true;
  }

  return false;
};

/**
 * Keymap array to be merged into the editor's key bindings.
 */
export const smartListKeymap = keymap.of([
  { key: 'Enter', run: smartNewline },
  { key: 'Backspace', run: smartBackspace },
  { key: 'Tab', run: indentListItem, shift: unindentListItem },
]);