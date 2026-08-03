import React, { useMemo, useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { getThemeById } from '../features/editor/themes';
import { tryFormatJson } from '../fileUtils';
import type { EditorDocumentType } from '../types';

interface PreviewProps {
  content: string;
  themeId: string;
  documentType: EditorDocumentType;
  jsonIndentSize: number;
}

/**
 * Debounce the raw content so expensive parsing (marked.parse, JSON.parse)
 * doesn't run on every single keystroke.  The preview stays on the previous
 * render until 300 ms after the user stops typing.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delayMs]);

  return debounced;
}

const Preview: React.FC<PreviewProps> = ({ content, themeId, documentType, jsonIndentSize }) => {
  const theme = getThemeById(themeId);
  const c = theme.colors;

  const debouncedContent = useDebouncedValue(content, 300);

  const markdownHtml = useMemo(() => {
    if (documentType !== 'markdown') return '';

    // Markdown preview is rendered separately from the editor, so parsing stays isolated here.
    try {
      return marked.parse(debouncedContent, { async: false }) as string;
    } catch {
      return '';
    }
  }, [debouncedContent, documentType]);

  const jsonPreview = useMemo(() => {
    if (documentType !== 'json') return null;

    // The preview prefers formatted JSON, but falls back to raw text when parsing fails.
    const formatted = tryFormatJson(debouncedContent, jsonIndentSize);
    return {
      content: formatted ?? debouncedContent,
      hasError: formatted === null,
    };
  }, [debouncedContent, documentType, jsonIndentSize]);

  if (documentType === 'json' && jsonPreview) {
    return (
      <div
        className="h-full w-full overflow-auto p-8 preview-container"
        style={{
          backgroundColor: c.background,
          color: c.foreground,
        }}
      >
        <div className="max-w-4xl mx-auto space-y-4">
          {jsonPreview.hasError && (
            <div
              className="rounded-xl border px-4 py-3 text-xs"
              style={{
                borderColor: `${c.foreground}25`,
                backgroundColor: c.codeBackground || `${c.background}80`,
              }}
            >
              Invalid JSON detected. Showing the current document content without preview formatting.
            </div>
          )}
          <pre
            className="rounded-xl border p-6 text-sm leading-6 whitespace-pre-wrap break-words overflow-x-auto"
            style={{
              borderColor: `${c.foreground}20`,
              backgroundColor: c.codeBackground || `${c.background}80`,
              color: c.code || c.foreground,
            }}
          >
            {jsonPreview.content}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full overflow-auto p-8 preview-container"
      style={{
        backgroundColor: c.background,
        color: c.foreground,
      }}
    >
      <div
        className="prose prose-sm md:prose-base lg:prose-lg max-w-3xl mx-auto transition-colors duration-200 [&_h1]:border-b-0 [&_h2]:border-b-0 [&_h1]:pb-0 [&_h2]:pb-0"
        style={{
          '--tw-prose-body': c.foreground,
          '--tw-prose-headings': c.heading || c.foreground,
          '--tw-prose-links': c.link || c.foreground,
          '--tw-prose-bold': c.bold || c.foreground,
          '--tw-prose-counters': c.foreground,
          '--tw-prose-bullets': c.foreground,
          '--tw-prose-hr': c.hr || `${c.foreground}40`,
          '--tw-prose-quotes': c.blockquote || c.foreground,
          '--tw-prose-quote-borders': c.blockquoteBorder || c.foreground,
          '--tw-prose-code': c.code || c.foreground,
          '--tw-prose-pre-code': c.code || c.foreground,
          '--tw-prose-pre-bg': c.codeBackground || `${c.background}80`,
          '--tw-prose-th-borders': `${c.foreground}40`,
          '--tw-prose-td-borders': `${c.foreground}20`,
        } as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: markdownHtml }}
      />
    </div>
  );
};

export default React.memo(Preview);

