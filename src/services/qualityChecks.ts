import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, EditorDocumentType } from '../types';
import { validateJsonAgainstCatalog } from './schemaCatalog';
import markdownlintConfig from '../../.markdownlint.json';

export type QualityIssueSource =
  | 'editor'
  | 'markdownlint'
  | 'jsonschema'
  | 'lychee'
  | 'ripsecrets';

export interface QualityIssue {
  source: QualityIssueSource;
  severity: 'warning' | 'error';
  message: string;
  fileIdentity: string;
  filePath?: string;
  line?: number;
  column?: number;
  word?: string;
  suggestions?: string[];
}

export interface RunQualityChecksInput {
  fileIdentity: string;
  filePath?: string;
  content: string;
  documentType: EditorDocumentType;
  settings: AppSettings;
  phase?: 'live' | 'save';
}

interface LinkCheckIssue {
  url: string;
  status: string;
  message: string;
}

interface SecretScanResult {
  matches: number;
}



function getJsonSyntaxIssue(input: RunQualityChecksInput): QualityIssue | null {
  try {
    JSON.parse(input.content);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON syntax';
    const positionMatch = /position\s+(\d+)/i.exec(message);
    let line: number | undefined;
    let column: number | undefined;

    if (positionMatch) {
      const position = Number.parseInt(positionMatch[1], 10);
      if (Number.isFinite(position) && position >= 0) {
        const prefix = input.content.slice(0, position);
        const lines = prefix.split('\n');
        line = lines.length;
        column = (lines[lines.length - 1]?.length ?? 0) + 1;
      }
    }

    return {
      source: 'jsonschema',
      severity: input.settings.jsonSchemaSeverity,
      message: `JSON syntax error: ${message}`,
      fileIdentity: input.fileIdentity,
      filePath: input.filePath,
      line,
      column,
    };
  }
}

function truncateIssues(issues: QualityIssue[], max = 30): QualityIssue[] {
  if (issues.length <= max) return issues;
  const anchor = issues[0];
  return [
    ...issues.slice(0, max),
    {
      source: 'markdownlint',
      severity: 'warning',
      message: `...and ${issues.length - max} more issues`,
      fileIdentity: anchor.fileIdentity,
      filePath: anchor.filePath,
      line: anchor.line,
      column: anchor.column,
    },
  ];
}

async function runMarkdownlint(content: string, input: RunQualityChecksInput): Promise<QualityIssue[]> {
  const markdownlint = await import('markdownlint/promise');
  const result = await markdownlint.lint({ config: markdownlintConfig as any, strings: { content } });
  const issues = (result.content ?? []).map((issue: any) => {
    const ruleName = issue.ruleNames?.[0] ?? 'rule';
    return {
      source: 'markdownlint' as const,
      severity: input.settings.markdownLintSeverity,
      message: `Line ${issue.lineNumber} (${ruleName}): ${issue.ruleDescription}`,
      fileIdentity: input.fileIdentity,
      filePath: input.filePath,
      line: issue.lineNumber,
      column: issue.errorRange?.[0],
    };
  });
  return truncateIssues(issues, 20);
}



async function runLychee(input: RunQualityChecksInput): Promise<QualityIssue[]> {
  const issues = await invoke<LinkCheckIssue[]>('check_links_with_lychee', { content: input.content });
  return truncateIssues(
    issues.map((issue) => ({
      source: 'lychee' as const,
      severity: input.settings.linkCheckSeverity,
      message: `${issue.status}: ${issue.url} (${issue.message})`,
      fileIdentity: input.fileIdentity,
      filePath: input.filePath,
    })),
    20,
  );
}

async function runRipsecrets(input: RunQualityChecksInput): Promise<QualityIssue[]> {
  const result = await invoke<SecretScanResult>('scan_secrets_with_ripsecrets', { content: input.content });
  if (result.matches <= 0) return [];
  return [
    {
      source: 'ripsecrets',
      severity: input.settings.blockSaveOnSecrets ? 'error' : 'warning',
      message: `Potential secret patterns found (${result.matches} matches).`,
      fileIdentity: input.fileIdentity,
      filePath: input.filePath,
    },
  ];
}

async function runJsonschema(input: RunQualityChecksInput): Promise<QualityIssue[]> {
  const errors = await validateJsonAgainstCatalog(input.fileIdentity, input.content);
  return errors.map((message) => ({
    source: 'jsonschema' as const,
    severity: input.settings.jsonSchemaSeverity,
    message,
    fileIdentity: input.fileIdentity,
    filePath: input.filePath,
  }));
}

export async function runQualityChecks(input: RunQualityChecksInput): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];
  const phase = input.phase ?? 'save';
  const tasks: Promise<QualityIssue[]>[] = [];

  if (input.settings.enableMarkdownLint && input.documentType === 'markdown') {
    tasks.push(
      runMarkdownlint(input.content, input).catch((error) => {
        console.warn('markdownlint failed:', error);
        return [{
          source: 'markdownlint',
          severity: 'warning',
          message: 'Markdownlint failed to run.',
          fileIdentity: input.fileIdentity,
          filePath: input.filePath,
        }];
      })
    );
  }



  if (input.documentType === 'json') {
    const syntaxIssue = getJsonSyntaxIssue(input);
    if (syntaxIssue) {
      issues.push(syntaxIssue);
    } else if (input.settings.enableJsonSchemaLint) {
      tasks.push(
        runJsonschema(input).catch((error) => {
          console.warn('jsonschema validation failed:', error);
          return [{
            source: 'jsonschema',
            severity: 'warning',
            message: 'JSON schema validation failed to run.',
            fileIdentity: input.fileIdentity,
            filePath: input.filePath,
          }];
        })
      );
    }
  }

  if (phase === 'save' && input.settings.enableLinkCheck && input.documentType === 'markdown') {
    tasks.push(
      runLychee(input).catch((error) => {
        console.warn('lychee link check failed:', error);
        return [{
          source: 'lychee',
          severity: 'warning',
          message: 'Lychee link check failed to run.',
          fileIdentity: input.fileIdentity,
          filePath: input.filePath,
        }];
      })
    );
  }

  if (phase === 'save' && input.settings.enableSecretScan) {
    tasks.push(
      runRipsecrets(input).catch((error) => {
        console.warn('ripsecrets scan failed:', error);
        return [{
          source: 'ripsecrets',
          severity: 'warning',
          message: 'Ripsecrets scan failed to run.',
          fileIdentity: input.fileIdentity,
          filePath: input.filePath,
        }];
      })
    );
  }

  const results = await Promise.all(tasks);
  for (const res of results) {
    issues.push(...res);
  }

  return issues;
}

export function formatQualityIssueSummary(issues: QualityIssue[], maxLines = 12): string {
  const lines = issues.slice(0, maxLines).map((issue) => {
    const sev = issue.severity === 'error' ? 'ERROR' : 'WARN';
    return `[${sev}] ${issue.source}: ${issue.message}`;
  });

  if (issues.length > maxLines) {
    lines.push(`...and ${issues.length - maxLines} additional issues`);
  }

  return lines.join('\n');
}
