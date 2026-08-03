import React from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { QualityIssue } from '../services/qualityChecks';

interface ProblemsPanelProps {
  issues: QualityIssue[];
  onIssueClick: (issue: QualityIssue) => void;
}

const sourceLabels: Record<QualityIssue['source'], string> = {
  editor: 'Editor',
  markdownlint: 'Markdownlint',
  jsonschema: 'JSON Schema',
  lychee: 'Lychee',
  ripsecrets: 'Ripsecrets',
};

function fileNameFromIssue(issue: QualityIssue): string {
  const value = issue.filePath || issue.fileIdentity;
  const normalized = value.replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
}

const ProblemsPanel: React.FC<ProblemsPanelProps> = ({ issues, onIssueClick }) => {
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-center opacity-40">
        <IconAlertTriangle className="h-8 w-8 mb-3" stroke={1.75} />
        <p className="text-xs">No problems reported yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      {issues.map((issue, index) => {
        const location = issue.line ? `:${issue.line}${issue.column ? `:${issue.column}` : ''}` : '';
        return (
          <button
            key={`${issue.fileIdentity}-${issue.source}-${index}`}
            onClick={() => onIssueClick(issue)}
            className="w-full text-left p-2 hover:bg-white/10 rounded-md mb-1 transition-colors group"
          >
            <div className="flex items-center text-[11px] opacity-70 mb-1">
              <IconAlertTriangle
                className={`w-3 h-3 mr-1 ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}
                stroke={1.75}
              />
              <span className="truncate">{fileNameFromIssue(issue)}{location}</span>
              <span className="ml-auto opacity-50">{sourceLabels[issue.source]}</span>
            </div>
            <div className="text-[12px] opacity-90 group-hover:opacity-100">
              {issue.message}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default React.memo(ProblemsPanel);
