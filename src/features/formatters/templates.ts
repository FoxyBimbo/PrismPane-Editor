// ============================================================
// PrismPane — Base Document Templates (auto-discovered)
// ============================================================

import type { Template } from '../../types';

// Dynamically import all .md files from the templates directory.
// Vite resolves these at build time — no manual imports needed.
const templateModules = import.meta.glob<{ default: string }>(
  '../../templates/*.md',
  { query: '?raw', eager: true },
);

function deriveId(filename: string): string {
  return filename
    .replace(/^.*[\\/]/, '')
    .replace(/\.md$/, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function deriveName(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.md$/, '');

  // Keep README uppercase by convention
  if (base === 'README') return 'README.md';

  // Split on hyphens, capitalise each word (handles both kebab-case and CamelCase)
  return base
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveDescription(filename: string): string {
  const id = deriveId(filename);
  const descriptions: Record<string, string> = {
    agents: 'Specification template for AI agent definitions.',
    architecture: 'System architecture documentation structure.',
    'blog-post': 'Template for writing a blog article or essay.',
    changelog: 'Keep a Changelog formatted release notes.',
    'meeting-notes': 'Structured template for taking meeting minutes.',
    readme: 'Standard GitHub-flavored README structure.',
  };
  return descriptions[id] ?? `Template: ${deriveName(filename)}`;
}

/** Replace well-known template placeholders with today's date. */
function processContent(content: string): string {
  const now = new Date();
  return content
    .replace(/\{\{DATE\}\}/g, now.toLocaleDateString())
    .replace(/\{\{YEAR\}\}/g, now.getFullYear().toString())
    .replace(
      /\{\{LONG_DATE\}\}/g,
      now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    );
}

// Build the templates array from discovered modules
export const TEMPLATES: Template[] = Object.entries(templateModules).map(
  ([path, mod]) => ({
    id: deriveId(path),
    name: deriveName(path),
    description: deriveDescription(path),
    content: processContent(mod.default),
  }),
);

export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}