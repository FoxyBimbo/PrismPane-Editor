import React, { useMemo } from 'react';
import { IconAlignLeft, IconChevronRight } from '@tabler/icons-react';

interface OutlinePanelProps {
  content: string | null;
  onNavigateToLine: (lineNumber: number) => void;
  fgColor: string;
}

interface Heading {
  level: number;
  text: string;
  line: number;
}

const OutlinePanel: React.FC<OutlinePanelProps> = ({ content, onNavigateToLine, fgColor }) => {
  const headings = useMemo(() => {
    if (!content) return [];
    const lines = content.split('\n');
    const results: Heading[] = [];
    const headingRegex = /^(#{1,6})\s+(.*)$/;
    
    // Simple state to skip code blocks
    let inCodeBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      
      if (!inCodeBlock) {
        const match = line.match(headingRegex);
        if (match) {
          results.push({
            level: match[1].length,
            text: match[2].trim(),
            line: i + 1, // 1-indexed for CodeMirror
          });
        }
      }
    }
    return results;
  }, [content]);

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-center opacity-40">
        <IconAlignLeft className="h-8 w-8 mb-3" stroke={1.75} />
        <p className="text-xs">Open a file to see its outline</p>
      </div>
    );
  }

  if (headings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-center opacity-40">
        <p className="text-xs">No headings found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {headings.map((h, i) => (
        <button
          key={i}
          onClick={() => onNavigateToLine(h.line)}
          className="w-full flex items-center px-3 py-1.5 text-left text-[12px] hover:bg-white/10 transition-colors"
          style={{ paddingLeft: `${(h.level - 1) * 12 + 12}px` }}
          title={h.text}
        >
          <IconChevronRight className="w-3 h-3 mr-1 opacity-40 shrink-0" stroke={1.75} />
          <span className="truncate opacity-80">{h.text}</span>
        </button>
      ))}
    </div>
  );
};

export default OutlinePanel;
