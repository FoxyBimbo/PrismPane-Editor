import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { QualityIssue } from '../src/services/qualityChecks';
import { buildSpellingRanges } from '../src/features/editor/Editor';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function main(): void {
  const content = 'This line has speling and another typo.\n';
  const issues: QualityIssue[] = [
    {
      source: 'cspell',
      severity: 'warning',
      message: 'Spelling: "speling"',
      fileIdentity: 'demo.md',
      filePath: 'demo.md',
      line: 1,
      column: 15,
      word: 'speling',
      suggestions: ['spelling', 'spieling'],
    },
  ];

  const ranges = buildSpellingRanges(content, issues);
  assert(ranges.length === 1, `Expected one spelling range, got ${ranges.length}`);
  assert(ranges[0]?.word === 'speling', `Expected word speling, got ${ranges[0]?.word ?? '(none)'}`);
  assert(ranges[0]?.suggestions?.length === 2, `Expected two suggestions, got ${ranges[0]?.suggestions?.length ?? 0}`);
  assert(content.slice(ranges[0]!.from, ranges[0]!.to) === 'speling', 'Range does not point to misspelled token');

  const cssPath = resolve(process.cwd(), 'src/style.css');
  const editorPath = resolve(process.cwd(), 'src/features/editor/Editor.tsx');
  const css = readFileSync(cssPath, 'utf8');
  const editorCode = readFileSync(editorPath, 'utf8');

  assert(css.includes('.cm-spell-squiggle'), 'Missing .cm-spell-squiggle style class');
  assert(css.includes('text-decoration-style: wavy'), 'Missing wavy underline style');
  assert(css.includes('text-decoration-color: #ef4444'), 'Missing red underline color');

  assert(editorCode.includes("container.addEventListener('contextmenu'"), 'Missing contextmenu listener for suggestion menu');
  assert(editorCode.includes('applySuggestion('), 'Missing applySuggestion replacement handler');

  console.log('Editor spelling UI verification: ok');
  console.log('Spelling range count:', ranges.length);
  console.log('Spelling range word:', ranges[0]?.word ?? '(none)');
  console.log('Suggestion count:', ranges[0]?.suggestions.length ?? 0);
  console.log('Squiggle style present: yes');
  console.log('Context menu wiring present: yes');
}

main();
