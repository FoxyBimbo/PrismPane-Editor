import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AppSettings } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';
import { runQualityChecks, type QualityIssue } from '../src/services/qualityChecks';
import { flattenAndSortProblems, mapEditorDiagnosticsToQualityIssues } from '../src/services/problemMapping';
import ProblemsPanel from '../src/components/ProblemsPanel';

function makeSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    enableCspellLint: false,
    enableMarkdownLint: true,
    markdownLintSeverity: 'warning',
    enableJsonSchemaLint: false,
    jsonSchemaSeverity: 'warning',
    enableLinkCheck: false,
    linkCheckSeverity: 'warning',
    enableSecretScan: false,
    blockSaveOnSecrets: false,
  };
}

async function run(): Promise<void> {
  const settings = makeSettings();

  const markdownIssues = await runQualityChecks({
    fileIdentity: 'notes.md',
    filePath: 'notes.md',
    content: '#bad-heading',
    documentType: 'markdown',
    settings,
    phase: 'live',
  });

  const jsonIssues = await runQualityChecks({
    fileIdentity: 'broken.json',
    filePath: 'broken.json',
    content: '{"name": }',
    documentType: 'json',
    settings,
    phase: 'live',
  });

  const editorMapped = mapEditorDiagnosticsToQualityIssues('broken.json', 'broken.json', [
    {
      message: 'Expected value',
      severity: 'error',
      line: 1,
      column: 10,
    },
  ]);

  const merged = flattenAndSortProblems(
    {
      'broken.json': editorMapped,
    },
    {
      'notes.md': markdownIssues,
      'broken.json': jsonIssues,
    },
  );

  if (markdownIssues.length === 0) {
    throw new Error('Expected markdown issues, got none.');
  }
  if (jsonIssues.length === 0) {
    throw new Error('Expected JSON issues, got none.');
  }
  if (merged.length === 0) {
    throw new Error('Expected merged problems, got none.');
  }

  const brokenJsonMerged = merged.filter((issue) => issue.fileIdentity === 'broken.json');
  if (brokenJsonMerged.length !== 1) {
    throw new Error(`Expected exactly one merged problem for broken.json, got ${brokenJsonMerged.length}.`);
  }
  if (brokenJsonMerged[0]?.source !== 'editor') {
    throw new Error(`Expected broken.json problem to prefer editor diagnostic, got ${brokenJsonMerged[0]?.source ?? '(none)'}.`);
  }

  const html = renderToStaticMarkup(
    React.createElement(ProblemsPanel, {
      issues: merged,
      onIssueClick: (_issue: QualityIssue) => undefined,
    }),
  );

  if (!html.includes('Expected value')) {
    throw new Error('Expected editor diagnostic to be present in ProblemsPanel markup.');
  }
  if (!html.includes('No space after hash on atx style heading')) {
    throw new Error('Expected markdown diagnostic to be present in ProblemsPanel markup.');
  }
  if (html.includes('JSON syntax error')) {
    throw new Error('Expected fallback JSON syntax diagnostic to be suppressed when editor diagnostics exist.');
  }

  console.log('Markdown issues:', markdownIssues.length);
  console.log('Markdown sample:', markdownIssues[0]?.message ?? '(none)');
  console.log('JSON issues:', jsonIssues.length);
  console.log('JSON sample:', jsonIssues[0]?.message ?? '(none)');
  console.log('Merged problems:', merged.length);
  console.log('Merged broken.json problems:', brokenJsonMerged.length);
  console.log('Merged broken.json source:', brokenJsonMerged[0]?.source ?? '(none)');
  console.log('Top merged item:', merged[0]?.message ?? '(none)');
  console.log('ProblemsPanel rendered entries include editor diagnostic: yes');
  console.log('ProblemsPanel rendered entries include markdown diagnostic: yes');
  console.log('ProblemsPanel rendered fallback JSON syntax diagnostic: no');
  console.log('Rendered markup snippet:', html.slice(0, 320).replace(/\s+/g, ' ').trim());
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
