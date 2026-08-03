import type { QualityIssue } from './qualityChecks';

export interface EditorDiagnosticPayload {
  message: string;
  severity: 'error' | 'warning' | 'info';
  line: number;
  column: number;
}

export function mapEditorDiagnosticsToQualityIssues(
  fileIdentity: string,
  filePath: string | undefined,
  diagnostics: EditorDiagnosticPayload[],
): QualityIssue[] {
  return diagnostics.map((diagnostic) => ({
    source: 'editor',
    severity: diagnostic.severity === 'error' ? 'error' : 'warning',
    message: diagnostic.message,
    fileIdentity,
    filePath,
    line: diagnostic.line,
    column: diagnostic.column,
  }));
}

function normalizeProblemMessage(issue: QualityIssue): string {
  return issue.message.replace(/^JSON syntax error:\s*/i, '').trim();
}

function isJsonSyntaxFallback(issue: QualityIssue): boolean {
  return issue.source === 'jsonschema' && /^JSON syntax error:/i.test(issue.message);
}

function problemKey(issue: QualityIssue): string {
  return [
    issue.filePath ?? issue.fileIdentity,
    issue.line ?? '',
    issue.column ?? '',
    normalizeProblemMessage(issue).toLowerCase(),
  ].join('::');
}

function choosePreferredProblem(current: QualityIssue, candidate: QualityIssue): QualityIssue {
  if (current.source === candidate.source) {
    if (current.severity === candidate.severity) return current;
    return current.severity === 'error' ? current : candidate;
  }

  if (current.source === 'editor') return current;
  if (candidate.source === 'editor') return candidate;

  if (current.severity !== candidate.severity) {
    return current.severity === 'error' ? current : candidate;
  }

  return current;
}

export function flattenAndSortProblems(
  editorProblemsByFile: Record<string, QualityIssue[]>,
  qualityProblemsByFile: Record<string, QualityIssue[]>,
): QualityIssue[] {
  const editorFiles = new Set(
    Object.entries(editorProblemsByFile)
      .filter(([, issues]) => issues.length > 0)
      .map(([fileIdentity]) => fileIdentity),
  );

  const deduped = new Map<string, QualityIssue>();
  const merged = [
    ...Object.values(editorProblemsByFile).flat(),
    ...Object.values(qualityProblemsByFile)
      .flat()
      .filter((issue) => !(editorFiles.has(issue.fileIdentity) && isJsonSyntaxFallback(issue))),
  ];

  for (const issue of merged) {
    const key = problemKey(issue);
    const existing = deduped.get(key);
    deduped.set(key, existing ? choosePreferredProblem(existing, issue) : issue);
  }

  return [...deduped.values()].sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === 'error' ? -1 : 1;
    }

    const leftLine = left.line ?? Number.MAX_SAFE_INTEGER;
    const rightLine = right.line ?? Number.MAX_SAFE_INTEGER;
    return leftLine - rightLine;
  });
}
