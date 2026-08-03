// ============================================================
// PrismPane — Dynamic CodeMirror Theme Extension
// ============================================================

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { AppSettings, EditorThemeColors } from '../../types';
import { getThemeById } from './themes';

interface JsonSectionPalette {
  header: string;
  field: string;
  string: string;
  number: string;
  boolean: string;
  null: string;
  brace: string;
  punctuation: string;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHex(value: string): string {
  const hex = value.trim().replace('#', '');

  if (hex.length === 3) {
    return hex.split('').map((char) => `${char}${char}`).join('');
  }

  if (hex.length === 6 || hex.length === 8) {
    return hex.slice(0, 6);
  }

  return '000000';
}

function hexToRgb(value: string) {
  const normalized = normalizeHex(value);
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function mixColors(primary: string, secondary: string, secondaryWeight: number): string {
  const clampedWeight = Math.max(0, Math.min(1, secondaryWeight));
  const primaryRgb = hexToRgb(primary);
  const secondaryRgb = hexToRgb(secondary);
  const primaryWeight = 1 - clampedWeight;

  return `#${[
    clampChannel(primaryRgb.red * primaryWeight + secondaryRgb.red * clampedWeight),
    clampChannel(primaryRgb.green * primaryWeight + secondaryRgb.green * clampedWeight),
    clampChannel(primaryRgb.blue * primaryWeight + secondaryRgb.blue * clampedWeight),
  ].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function buildJsonSectionPalettes(colors: EditorThemeColors): JsonSectionPalette[] {
  const anchors = [
    colors.heading1,
    colors.heading2,
    colors.heading3,
    colors.link,
    colors.code,
    colors.bold,
  ];

  return anchors.map((anchor, index) => {
    const numberAccent = anchors[(index + 3) % anchors.length];

    return {
    header: mixColors(anchor, '#ffffff', 0.14),
    field: mixColors(anchor, colors.foreground, 0.32),
    string: mixColors(anchor, colors.code, 0.42),
    number: mixColors(mixColors(anchor, numberAccent, 0.58), '#ffffff', 0.08),
    boolean: mixColors(anchor, colors.italic, 0.24),
    null: mixColors(anchor, colors.blockquote, 0.3),
    brace: mixColors(anchor, colors.foreground, 0.54),
    punctuation: mixColors(anchor, colors.gutterForeground, 0.58),
    };
  });
}

/**
 * Build a CodeMirror HighlightStyle from a theme's color palette.
 * Maps Lezer syntax tags to theme-specific colors for rich Markdown styling.
 */
function buildHighlightStyle(colors: EditorThemeColors): HighlightStyle {
  return HighlightStyle.define([
    // Core syntax
    { tag: t.heading, color: colors.heading, fontWeight: 'bold', textDecoration: 'none' },
    { tag: t.heading1, color: colors.heading1, fontSize: '1.6em', fontWeight: 'bold', textDecoration: 'none' },
    { tag: t.heading2, color: colors.heading2, fontSize: '1.3em', fontWeight: 'bold', textDecoration: 'none' },
    { tag: t.heading3, color: colors.heading3, fontSize: '1.1em', fontWeight: 'bold', textDecoration: 'none' },
    { tag: t.heading4, color: colors.heading, fontSize: '1.0em', fontWeight: 'bold', textDecoration: 'none' },
    { tag: t.heading5, color: colors.heading, fontSize: '0.9em', fontWeight: 'bold', textDecoration: 'none' },
    { tag: t.heading6, color: colors.heading, fontSize: '0.85em', fontWeight: 'bold', textDecoration: 'none' },
    { tag: t.strong, color: colors.bold, fontWeight: 'bold' },
    { tag: t.emphasis, color: colors.italic, fontStyle: 'italic' },
    { tag: t.link, color: colors.link, textDecoration: 'underline' },
    { tag: t.monospace, color: colors.code, backgroundColor: colors.codeBackground, borderRadius: '3px', padding: '1px 4px' },
    { tag: t.url, color: colors.link, textDecoration: 'underline' },
    { tag: t.contentSeparator, color: colors.hr },
    { tag: t.processingInstruction, color: colors.hr, textDecoration: 'none' },

    // Markdown-specific tags
    { tag: t.atom, color: colors.code },
    { tag: t.bool, color: colors.code },
    { tag: t.special(t.string), color: colors.linkText },
    { tag: t.string, color: colors.foreground },
    { tag: t.comment, color: colors.strikethrough, fontStyle: 'italic' },
    { tag: t.meta, color: colors.blockquote },
    { tag: t.keyword, color: colors.bold },
    { tag: t.operator, color: colors.foreground },
    { tag: t.punctuation, color: colors.foreground },
    { tag: t.number, color: colors.code },
    { tag: t.regexp, color: colors.code },
    { tag: t.typeName, color: colors.heading },
    { tag: t.labelName, color: colors.list },
    { tag: t.namespace, color: colors.heading },
    { tag: t.className, color: colors.heading },
    { tag: t.variableName, color: colors.foreground },
    { tag: t.attributeName, color: colors.link },
    { tag: t.attributeValue, color: colors.code },
    { tag: t.inserted, color: colors.list },
    { tag: t.deleted, color: colors.strikethrough, textDecoration: 'line-through' },
    { tag: t.changed, color: colors.italic },

    // Blockquote styling via special tag mapping
    { tag: t.quote, color: colors.blockquote, fontStyle: 'italic' },

    // List markers
    { tag: t.list, color: colors.list },

    // Strikethrough
    { tag: t.strikethrough, color: colors.strikethrough, textDecoration: 'line-through' },

    // Image alt text (use keyword as closest match)
    { tag: t.keyword, color: colors.image },
  ]);
}

/**
 * Creates a CodeMirror theme extension (EditorView theme) from the
 * current app settings. This applies background, gutter, selection,
 * cursor, and line highlight colors.
 */
export function createThemeExtension(settings: AppSettings) {
  const theme = getThemeById(settings.themeId);
  const { colors } = theme;
  const jsonSectionPalettes = buildJsonSectionPalettes(colors);
  const defaultJsonPalette = jsonSectionPalettes[0];
  const foldButtonBackground = mixColors(colors.toolbarBackground, colors.background, 0.2);
  const foldButtonBorder = mixColors(colors.hr, colors.foreground, 0.22);
  const foldButtonHover = mixColors(colors.toolbarBackground, colors.activeTab, 0.18);
  const foldButtonHoverBorder = mixColors(colors.hr, colors.activeTab, 0.4);
  const jsonSectionStyles = jsonSectionPalettes.reduce<Record<string, Record<string, string>>>((styles, palette, index) => {
    styles[`.cm-json-section-${index}`] = {
      '--json-header-color': palette.header,
      '--json-field-color': palette.field,
      '--json-string-color': palette.string,
      '--json-number-color': palette.number,
      '--json-boolean-color': palette.boolean,
      '--json-null-color': palette.null,
      '--json-brace-color': palette.brace,
      '--json-punctuation-color': palette.punctuation,
    };
    return styles;
  }, {});

  return [
    EditorView.theme(
      {
        '&': {
          backgroundColor: colors.background,
          color: colors.foreground,
          fontSize: `${settings.fontSize}px`,
          lineHeight: `${settings.lineHeight}`,
          '--json-header-color': defaultJsonPalette.header,
          '--json-field-color': defaultJsonPalette.field,
          '--json-string-color': defaultJsonPalette.string,
          '--json-number-color': defaultJsonPalette.number,
          '--json-boolean-color': defaultJsonPalette.boolean,
          '--json-null-color': defaultJsonPalette.null,
          '--json-brace-color': defaultJsonPalette.brace,
          '--json-punctuation-color': defaultJsonPalette.punctuation,
        },
        '& ::selection, & .cm-content ::selection, & .cm-content span::selection': {
          color: `${colors.selectionText} !important`,
        },
        '.cm-content': {
          fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
          padding: '12px 0',
        },
        '.cm-cursor': {
          borderLeftColor: colors.cursor,
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: colors.cursor,
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
          backgroundColor: colors.selection,
        },
        '.cm-activeLine': {
          backgroundColor: colors.lineHighlight,
        },
        '.cm-gutters': {
          backgroundColor: colors.gutterBackground,
          color: colors.gutterForeground,
          border: 'none',
          paddingRight: '0',
        },
        '.cm-lineNumbers': {
          backgroundColor: colors.gutterBackground,
          paddingLeft: '2px',
          paddingRight: '2px',
        },
        '.cm-lineNumbers .cm-gutterElement': {
          padding: '0 8px 0 6px',
        },
        '.cm-activeLineGutter': {
          backgroundColor: colors.lineHighlight,
          color: colors.gutterForeground,
        },
        '.cm-foldGutter': {
          marginLeft: '4px',
          paddingLeft: '0',
          backgroundColor: colors.background,
        },
        '.cm-foldGutter .cm-gutterElement': {
          minWidth: '22px',
          padding: '0 4px 0 2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        '.cm-foldGutter .cm-foldButton': {
          width: '16px',
          height: '16px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${foldButtonBorder}`,
          borderRadius: '4px',
          backgroundColor: foldButtonBackground,
          color: colors.toolbarForeground,
          fontSize: '12px',
          lineHeight: '1',
          fontWeight: '700',
          boxSizing: 'border-box',
          transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
        },
        '.cm-foldGutter .cm-gutterElement:hover .cm-foldButton': {
          backgroundColor: foldButtonHover,
          borderColor: foldButtonHoverBorder,
          color: colors.activeTab,
        },
        '.cm-foldGutter .cm-foldButton--closed': {
          fontSize: '11px',
        },
        '.cm-foldPlaceholder': {
          backgroundColor: colors.selection,
          color: colors.foreground,
        },
        '.cm-matchingBracket': {
          backgroundColor: colors.selection,
          outline: `1px solid ${colors.foreground}44`,
        },
        '.cm-searchMatch': {
          backgroundColor: colors.selection,
          outline: `1px solid ${colors.cursor}`,
        },
        '.cm-selectionMatch': {
          backgroundColor: colors.selectionMatch,
        },
        '.cm-panels': {
          zIndex: '40 !important',
        },
        // Search Panel styling
        '.cm-panel.cm-search': {
          backgroundColor: colors.toolbarBackground,
          color: colors.toolbarForeground,
          padding: '10px 14px',
          fontFamily: '"Outfit", "Inter", system-ui, sans-serif',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          flexWrap: 'wrap',
        },
        '.cm-panel.cm-search .cm-textfield': {
          backgroundColor: colors.background,
          color: colors.foreground,
          border: `1px solid ${colors.hr}`,
          borderRadius: '6px',
          padding: '6px 12px',
          outline: 'none',
          fontSize: '0.9rem',
          transition: 'all 0.2s',
          fontFamily: 'inherit',
        },
        '.cm-panel.cm-search .cm-textfield:focus': {
          borderColor: colors.activeTab,
          boxShadow: `0 0 0 2px ${colors.selection}`,
        },
        '.cm-panel.cm-search .cm-button': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--sidebar-active)',
          backgroundImage: 'none',
          color: '#000',
          border: '1px solid transparent',
          borderRadius: '6px',
          padding: '6px 14px',
          cursor: 'pointer',
          fontSize: '0.9rem',
          transition: 'opacity 0.2s',
          fontWeight: '500',
          fontFamily: 'inherit',
          textTransform: 'capitalize',
        },
        '.cm-panel.cm-search .cm-button:hover': {
          opacity: 0.9,
        },
        '.cm-panel.cm-search .cm-button:active': {
          transform: 'none',
        },
        '.cm-panel.cm-search button[name="select"]': {
          display: 'none',
        },
        '.cm-panel.cm-search label': {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          cursor: 'pointer',
          userSelect: 'none',
        },
        '.cm-panel.cm-search input[type="checkbox"]': {
          appearance: 'none',
          width: '18px',
          height: '18px',
          border: '1px solid white',
          borderRadius: '3px',
          cursor: 'pointer',
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          backgroundColor: 'transparent',
        },
        '.cm-panel.cm-search input[type="checkbox"]:checked::after': {
          content: '""',
          position: 'absolute',
          width: '4px',
          height: '10px',
          border: 'solid white',
          borderWidth: '0 2px 2px 0',
          transform: 'rotate(45deg)',
          marginTop: '-2px',
        },
        '.cm-panel.cm-search button[name="close"]': {
          background: 'transparent',
          border: 'none',
          padding: '4px 8px',
          color: colors.toolbarForeground,
          cursor: 'pointer',
          opacity: 0.7,
          fontSize: '1.2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 'auto',
          transition: 'color 0.2s, opacity 0.2s',
        },
        '.cm-panel.cm-search button[name="close"]:hover': {
          opacity: 1,
          background: 'transparent',
          color: colors.activeTab,
        },
        // Blockquote left border via a custom class we'll inject
        '.cm-blockquote-border': {
          borderLeft: `3px solid ${colors.blockquoteBorder}`,
          marginLeft: '4px',
          paddingLeft: '12px',
        },
        '.cm-json-header, .cm-json-header *': {
          color: 'var(--json-header-color) !important',
          fontWeight: '700',
        },
        '.cm-json-field, .cm-json-field *': {
          color: 'var(--json-field-color) !important',
        },
        '.cm-json-string, .cm-json-string *': {
          color: 'var(--json-string-color) !important',
        },
        '.cm-json-number, .cm-json-number *': {
          color: 'var(--json-number-color) !important',
          fontWeight: '600',
        },
        '.cm-json-boolean, .cm-json-boolean *': {
          color: 'var(--json-boolean-color) !important',
          fontWeight: '600',
        },
        '.cm-json-null, .cm-json-null *': {
          color: 'var(--json-null-color) !important',
          fontStyle: 'italic',
        },
        '.cm-json-brace, .cm-json-brace *': {
          color: 'var(--json-brace-color) !important',
          fontWeight: '600',
        },
        '.cm-json-punctuation, .cm-json-punctuation *': {
          color: 'var(--json-punctuation-color) !important',
        },
        ...jsonSectionStyles,
        // Match the underline color to the heading level
        '.cm-heading-ul-1': { textDecoration: 'underline', textDecorationColor: colors.heading1 },
        '.cm-heading-ul-2': { textDecoration: 'underline', textDecorationColor: colors.heading2 },
        '.cm-heading-ul-3': { textDecoration: 'underline', textDecorationColor: colors.heading3 },
        '.cm-heading-ul-4, .cm-heading-ul-5, .cm-heading-ul-6': { 
          textDecoration: 'underline',
          textDecorationColor: colors.heading 
        },
        // Code block styling
        '.cm-codeblock': {
          backgroundColor: colors.codeBackground,
          borderRadius: '6px',
          padding: '8px 12px',
        },
      },
      { dark: true },
    ),
    syntaxHighlighting(buildHighlightStyle(colors)),
  ];
}