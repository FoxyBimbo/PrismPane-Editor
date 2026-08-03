// ============================================================
// PrismPane — Pure Markdown Block Transformation Utilities
// ============================================================

import type { BlockType } from '../../types';

/**
 * Regex patterns used to detect existing block markers at line start.
 * Order matters for stripping: heading patterns must match before generic #.
 */
const ALL_BLOCK_PATTERNS = /^(#{1,6}\s+|>\s?|[*\-+]\s|\d+\.\s)/;
const WHITESPACE_PREFIX = /^(\s*)/;

/**
 * Strips leading block syntax from a line of Markdown text.
 * Handles headings (#), blockquotes (>), unordered (* - +), and ordered (1.) lists.
 */
export function stripBlockMarkers(line: string): string {
  // Trim leading whitespace first so the ^-anchored regex can match
  // markers on indented lines like "  * hello" or "  1. world".
  // All callers that care about preserving leading whitespace
  // extract it separately via WHITESPACE_PREFIX before calling this.
  return line.trimStart().replace(ALL_BLOCK_PATTERNS, '');
}

/**
 * Returns the block type currently applied to a line, or null if it's plain text.
 */
export function detectBlockType(line: string): BlockType | null {
  const trimmed = line.trimStart();
  if (/^######\s/.test(trimmed)) return 'heading6';
  if (/^#####\s/.test(trimmed)) return 'heading5';
  if (/^####\s/.test(trimmed)) return 'heading4';
  if (/^###\s/.test(trimmed)) return 'heading3';
  if (/^##\s/.test(trimmed)) return 'heading2';
  if (/^#\s/.test(trimmed)) return 'heading1';
  if (/^>\s?/.test(trimmed)) return 'blockquote';
  if (/^\d+\.\s/.test(trimmed)) return 'orderedList';
  if (/^[*\-+]\s/.test(trimmed)) return 'bulletList';
  if (/^```/.test(trimmed)) return 'codeBlock';
  if (/^[-*_]{3,}\s*$/.test(trimmed)) return 'horizontalRule';
  return null;
}

/**
 * Checks whether a line is a heading already, and returns the heading level (1-6) or null.
 */
export function detectHeadingLevel(line: string): number | null {
  const trimmed = line.trimStart();
  const match = trimmed.match(/^(#{1,6})\s/);
  if (match) return match[1].length;
  return null;
}

/**
 * Mapping from block type to its Markdown prefix.
 */
function blockTypeToPrefix(type: BlockType, content: string): string {
  switch (type) {
    case 'heading1': return `# ${content}`;
    case 'heading2': return `## ${content}`;
    case 'heading3': return `### ${content}`;
    case 'heading4': return `#### ${content}`;
    case 'heading5': return `##### ${content}`;
    case 'heading6': return `###### ${content}`;
    case 'paragraph': return content;
    case 'blockquote': return `> ${content}`;
    case 'bulletList': return `* ${content}`;
    case 'orderedList': return `1. ${content}`;
    case 'codeBlock': return '```\n' + content + '\n```';
    case 'horizontalRule': return '---';
    default: {
      const _exhaustive: never = type;
      return `${_exhaustive}`;
    }
  }
}

/**
 * The set of block types where heading-level conversion is handled
 * (changing heading level instead of stripping first).
 */
const HEADING_TYPES: BlockType[] = [
  'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
];

/**
 * Transforms a single line to the target block type. Always applies
 * the transformation — toggle logic is handled at the Editor level.
 *
 * - For horizontalRule: replaces the entire line with "---".
 * - For headings: if the line is already a heading, changes to the new level
 *   rather than nesting # prefixes.
 * - For paragraph: strips all block markers.
 * Preserves leading whitespace for nested list support.
 */
export function transformLine(line: string, target: BlockType): string {
  if (target === 'horizontalRule') {
    return '---';
  }

  const leadingWs = line.match(WHITESPACE_PREFIX)?.[0] ?? '';
  const content = stripBlockMarkers(line);

  // For headings, if it's already some heading level, just change the level
  const headingLevel = detectHeadingLevel(line);
  if (headingLevel !== null && HEADING_TYPES.includes(target)) {
    return `${leadingWs}${blockTypeToPrefix(target, content)}`;
  }

  return `${leadingWs}${blockTypeToPrefix(target, content)}`;
}

/**
 * Transforms a single line to an ordered list item with a specific number.
 */
export function transformToOrderedList(line: string, num: number): string {
  const leadingWs = line.match(WHITESPACE_PREFIX)?.[0] ?? '';
  const content = stripBlockMarkers(line);
  return `${leadingWs}${num}. ${content}`;
}

/**
 * For a bullet list line, returns the list marker and its trailing space.
 * e.g. "* " or "- " or "+ "
 */
export function getListMarker(line: string): string | null {
  const trimmed = line.trimStart();
  const match = trimmed.match(/^([*\-+])\s/);
  if (match) return match[1] + ' ';
  // Also detect ordered list markers
  const orderedMatch = trimmed.match(/^(\d+\.)\s/);
  if (orderedMatch) return orderedMatch[1] + ' ';
  return null;
}

/**
 * Checks whether a line is an empty list item (only whitespace + marker + optional whitespace).
 * e.g. "* " or "  - " or "  1. " → true
 */
export function isEmptyListItem(line: string): boolean {
  const stripped = stripBlockMarkers(line.trimStart());
  return stripped.trim() === '';
}

/**
 * Clears the list marker from a line, leaving only leading whitespace.
 * Used when a user presses Enter on an empty list item to break out of the list.
 */
export function clearListMarker(line: string): string {
  const leadingWs = line.match(WHITESPACE_PREFIX)?.[0] ?? '';
  return leadingWs;
}

/**
 * Prepends a list marker to a line if it doesn't already have one.
 * Preserves leading whitespace.
 */
export function prependListMarker(line: string, marker: string): string {
  const leadingWs = line.match(WHITESPACE_PREFIX)?.[0] ?? '';
  const content = stripBlockMarkers(line);
  if (content.trim() === '' && isEmptyListItem(line)) {
    return leadingWs;
  }
  return `${leadingWs}${marker}${content}`;
}

/**
 * Detects the list type from a line. Returns the marker prefix that should be
 * used for continuation (e.g. "* ", "- ", "+ ", "1. ").
 */
export function getListTypeInfo(line: string): { marker: string; indent: string; isOrdered: boolean; currentNumber?: number } | null {
  const trimmed = line.trimStart();
  const leadingWs = line.match(WHITESPACE_PREFIX)?.[0] ?? '';
  const indent = leadingWs;

  // Check ordered list first (more specific)
  const orderedMatch = trimmed.match(/^(\d+)\.\s/);
  if (orderedMatch) {
    const num = parseInt(orderedMatch[1], 10);
    return { marker: '1. ', indent, isOrdered: true, currentNumber: isNaN(num) ? undefined : num };
  }

  // Check unordered list
  const bulletMatch = trimmed.match(/^([*\-+])\s/);
  if (bulletMatch) {
    return { marker: bulletMatch[1] + ' ', indent, isOrdered: false };
  }

  return null;
}

/**
 * Given a line with indentation, returns the next ordered list number
 * that should be used for continuation at the same indent level.
 * Checks the current line's number first, then walks backwards.
 * If no previous number found at this level, returns 1.
 */
export function getNextOrderedNumber(lines: string[], currentIndex: number, indentLevel: number): number {
  // First check the current line itself — if it's an ordered list, increment its number
  if (currentIndex >= 0 && currentIndex < lines.length) {
    const currentLine = lines[currentIndex];
    const currentInfo = getListTypeInfo(currentLine);
    if (currentInfo && currentInfo.isOrdered && currentInfo.indent.length === indentLevel) {
      const currentNum = currentInfo.currentNumber ?? 1;
      return currentNum + 1;
    }
  }

  // Walk backwards to find the most recent ordered list item at the same indent level
  for (let i = currentIndex - 1; i >= 0; i--) {
    const line = lines[i];
    const listInfo = getListTypeInfo(line);
    if (listInfo && listInfo.isOrdered && listInfo.indent.length === indentLevel) {
      const match = line.trimStart().match(/^(\d+)\.\s/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) return num + 1;
      }
    }
    // If we hit a non-list, non-empty line at same or lower indent, stop
    if (line.trim() !== '' && !getListTypeInfo(line)) {
      const ws = line.match(/^(\s*)/)?.[0]?.length ?? 0;
      if (ws <= indentLevel) break;
    }
  }
  return 1;
}

/**
 * Indents a list line by adding indentation. For ordered lists, resets the number to 1.
 */
export function indentListLine(line: string): string {
  const listInfo = getListTypeInfo(line);
  if (!listInfo) {
    return '  ' + line;
  }
  const content = stripBlockMarkers(line.trimStart());
  if (listInfo.isOrdered) {
    return listInfo.indent + '  1. ' + content;
  }
  return listInfo.indent + '  ' + listInfo.marker + content;
}

/**
 * Un-indents a list line by removing one level of indentation.
 */
export function unindentListLine(line: string): string {
  const leadingWs = line.match(WHITESPACE_PREFIX)?.[0] ?? '';
  if (leadingWs.length >= 2) {
    return leadingWs.slice(2) + line.slice(leadingWs.length);
  }
  return line;
}

/**
 * Toggles inline formatting on selected text (bold, italic, strikethrough).
 * If the text is already wrapped, unwraps it. Otherwise wraps it.
 */
export function toggleInlineFormat(
  text: string,
  wrapper: string,
): { newText: string; isUnwrapping: boolean } {
  if (text.startsWith(wrapper) && text.endsWith(wrapper) && text.length >= wrapper.length * 2) {
    const inner = text.slice(wrapper.length, text.length - wrapper.length);
    if (inner.includes(wrapper) || inner.length > 0) {
      return { newText: inner, isUnwrapping: true };
    }
  }
  return { newText: `${wrapper}${text}${wrapper}`, isUnwrapping: false };
}

/**
 * The set of block types that should use "all-or-nothing" toggle behavior
 * for multi-line selections.
 */
export const LIST_AND_BLOCK_TYPES: BlockType[] = [
  'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
  'blockquote', 'bulletList', 'orderedList',
];

/**
 * Checks whether a detected type is a "list-like" type (for Tab indentation purposes).
 */
export function isListType(type: BlockType | null): boolean {
  return type === 'bulletList' || type === 'orderedList';
}