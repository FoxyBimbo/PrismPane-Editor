import type { EditorDocumentType, VisibleFilesMode } from './types';

const MARKDOWN_EXTENSION_RE = /\.(md|markdown|txt)$/i;
const JSON_EXTENSION_RE = /\.json$/i;
const FILE_EXTENSION_RE = /(\.[^./\\]+)$/;

export function isMarkdownDocument(nameOrPath: string): boolean {
  return MARKDOWN_EXTENSION_RE.test(nameOrPath);
}

export function isJsonDocument(nameOrPath: string): boolean {
  return JSON_EXTENSION_RE.test(nameOrPath);
}

export function getDocumentType(nameOrPath: string): EditorDocumentType {
  if (isJsonDocument(nameOrPath)) return 'json';
  if (isMarkdownDocument(nameOrPath)) return 'markdown';
  return 'text';
}

export function detectDocumentTypeFromContent(content: string): EditorDocumentType {
  const normalizedContent = content.replace(/^\uFEFF/, '').trim();

  if (!normalizedContent) return 'markdown';

  // JSON detection is content-based so pasted data can retitle untitled files.
  try {
    JSON.parse(normalizedContent);
    return 'json';
  } catch {
    return 'markdown';
  }
}

export function isVisibleFile(
  nameOrPath: string,
  isDirectory: boolean,
  visibleFiles: VisibleFilesMode,
): boolean {
  if (isDirectory) return true;

  switch (visibleFiles) {
    case 'markdown':
      return isMarkdownDocument(nameOrPath);
    case 'json':
      return isJsonDocument(nameOrPath);
    case 'markdown-json':
      return isMarkdownDocument(nameOrPath) || isJsonDocument(nameOrPath);
    case 'folders':
      return false;
    case 'all':
      return true;
    default:
      return isMarkdownDocument(nameOrPath);
  }
}

export function getDisplayName(fileName: string): string {
  if (isMarkdownDocument(fileName) || isJsonDocument(fileName)) {
    return fileName.replace(/\.(md|markdown|txt|json)$/i, '');
  }
  return fileName;
}

export function inferRenamedName(currentName: string, nextName: string): string {
  const trimmed = nextName.trim();
  if (!trimmed) return currentName;
  if (FILE_EXTENSION_RE.test(trimmed)) return trimmed;

  // Keep the current extension when the user renames only the base name.
  const currentExtension = currentName.match(FILE_EXTENSION_RE)?.[1];
  return currentExtension ? `${trimmed}${currentExtension}` : `${trimmed}.md`;
}

export function tryFormatJson(content: string, indentSize: number): string | null {
  try {
    return JSON.stringify(JSON.parse(content), null, indentSize);
  } catch {
    return null;
  }
}

export function getDocumentMimeType(documentType: EditorDocumentType): string {
  switch (documentType) {
    case 'json':
      return 'application/json';
    case 'markdown':
      return 'text/markdown';
    default:
      return 'text/plain';
  }
}

export function getExportBaseName(fileName: string): string {
  return fileName.replace(FILE_EXTENSION_RE, '');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}