import React, { useState, useCallback, useRef, useEffect } from 'react';
import { IconSearch, IconFileText, IconLoader2, IconFolder, IconChevronDown, IconChevronRight, IconAdjustments } from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/core';
import { isVisibleFile } from '../fileUtils';
import type { VisibleFilesMode } from '../types';

export interface SearchResult {
  type: 'folder' | 'file' | 'content';
  filePath: string;
  name: string;
  line?: number;
  content?: string;
}

interface SearchPanelProps {
  folderPath: string | null;
  onSearchResultClick: (result: SearchResult, options: { query: string; isRegex: boolean; matchCase: boolean }) => void;
  fgColor: string;
  visibleFiles: VisibleFilesMode;
  focusToken?: number;
}

const SearchPanel: React.FC<SearchPanelProps> = ({
  folderPath,
  onSearchResultClick,
  fgColor,
  visibleFiles,
  focusToken = 0,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchInsideFiles, setSearchInsideFiles] = useState(false);
  const [useRegEx, setUseRegEx] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  
  const [isBuildingIndex, setIsBuildingIndex] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShowAdvanced(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [focusToken]);

  useEffect(() => {
    if (folderPath) {
      const buildIndex = async () => {
        setIsBuildingIndex(true);
        try {
          await invoke('build_search_index', { path: folderPath });
        } catch (e) {
          console.error("Failed to build index", e);
        } finally {
          setIsBuildingIndex(false);
        }
      };
      buildIndex();
    }
  }, [folderPath]);

  const performSearch = useCallback(async (searchQuery: string, insideFiles: boolean, regex: boolean, caseSensitive: boolean) => {
    if (!folderPath || !searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    
    setIsSearching(true);
    setHasSearched(true);
    
    try {
      const backendResults: any[] = await invoke('search_index', {
        query: searchQuery,
        searchInside: insideFiles,
        useRegex: regex,
        matchCase: caseSensitive
      });

      const found: SearchResult[] = backendResults.map((res: any) => ({
        type: res.result_type as 'folder' | 'file' | 'content',
        filePath: res.file_path,
        name: res.name,
        line: res.line,
        content: res.content
      })).filter((result) =>
        isVisibleFile(result.filePath || result.name, result.type === 'folder', visibleFiles),
      );

      setResults(found);
    } catch (e) {
      console.error("Search error", e);
    } finally {
      setIsSearching(false);
    }
  }, [folderPath, visibleFiles]);

  const runSearch = useCallback(() => {
    performSearch(query, searchInsideFiles, useRegEx, matchCase);
  }, [query, searchInsideFiles, useRegEx, matchCase, performSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(val, searchInsideFiles, useRegEx, matchCase);
    }, 500);
  };

  // Re-run search if advanced toggles change
  useEffect(() => {
    if (query) {
      runSearch();
    }
  }, [searchInsideFiles, useRegEx, matchCase, visibleFiles]); // Intentionally omitting query/runSearch to avoid double fire

  const toggleRegEx = () => {
    setUseRegEx(prev => {
      const next = !prev;
      if (next) setMatchCase(false); // Mutually exclusive
      return next;
    });
  };

  const toggleMatchCase = () => {
    setMatchCase(prev => {
      const next = !prev;
      if (next) setUseRegEx(false); // Mutually exclusive
      return next;
    });
  };

  if (!folderPath) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-center opacity-40">
        <IconSearch className="h-8 w-8 mb-3" stroke={1.75} />
        <p className="text-xs">Open a folder to search</p>
      </div>
    );
  }

  return (
    <div className="card flex flex-col h-full prismpane-search-panel">
      <div className="p-3 border-b" style={{ borderColor: `${fgColor}15` }}>
        <div className="flex items-center px-2 py-1.5 rounded-md bg-black/10 border mb-2" style={{ borderColor: `${fgColor}20` }}>
          <IconSearch className="w-3.5 h-3.5 opacity-50 mr-2" stroke={1.75} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            placeholder="Search folder..."
            className="form-control form-control-sm flex-1 bg-transparent border-none outline-none text-[12px] shadow-none"
            style={{ color: fgColor }}
          />
        </div>
        
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="btn btn-sm btn-ghost-secondary flex items-center text-[11px] opacity-60 hover:opacity-100 transition-opacity"
        >
          <IconAdjustments className="w-3 h-3 mr-1" stroke={1.75} />
          Advanced
          {showAdvanced ? <IconChevronDown className="w-3 h-3 ml-1" stroke={1.75} /> : <IconChevronRight className="w-3 h-3 ml-1" stroke={1.75} />}
        </button>
        
        {showAdvanced && (
          <div className="mt-2 space-y-1.5 text-[11px] opacity-80 pl-4">
            <label className="form-check flex items-center gap-2 cursor-pointer hover:opacity-100">
              <input
                type="checkbox"
                checked={searchInsideFiles}
                onChange={(e) => setSearchInsideFiles(e.target.checked)}
                className="form-check-input accent-current"
              />
              <span className="form-check-label">Search Inside Files</span>
            </label>
            <label className="form-check flex items-center gap-2 cursor-pointer hover:opacity-100">
              <input
                type="checkbox"
                checked={useRegEx}
                onChange={toggleRegEx}
                className="form-check-input accent-current"
              />
              <span className="form-check-label">RegEx</span>
            </label>
            <label className="form-check flex items-center gap-2 cursor-pointer hover:opacity-100">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={toggleMatchCase}
                className="form-check-input accent-current"
              />
              <span className="form-check-label">Match Case</span>
            </label>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {(isSearching || isBuildingIndex) && (
          <div className="flex flex-col items-center justify-center p-4">
            <IconLoader2 className="w-5 h-5 animate-spin opacity-50 mb-2" stroke={1.75} />
            {isBuildingIndex && <span className="text-xs opacity-50">Indexing files...</span>}
          </div>
        )}
        
        {!isSearching && hasSearched && results.length === 0 && (
          <div className="text-center p-4 text-xs opacity-50">
            No results found
          </div>
        )}

        {!isSearching && results.map((res, i) => {
          return (
            <button
              key={i}
              onClick={() => onSearchResultClick(res, { query, isRegex: useRegEx, matchCase })}
              className="w-full text-left p-2 hover:bg-white/10 rounded-md mb-1 transition-colors group"
            >
              <div className="flex items-center text-[11px] opacity-70 mb-1">
                {res.type === 'folder' ? (
                  <IconFolder className="w-3 h-3 mr-1" stroke={1.75} />
                ) : (
                  <IconFileText className="w-3 h-3 mr-1" stroke={1.75} />
                )}
                <span className="truncate">{res.name}</span>
                {res.line !== undefined && (
                  <span className="ml-auto opacity-50">:{res.line}</span>
                )}
              </div>
              {res.content && (
                <div className="text-[12px] truncate opacity-90 group-hover:opacity-100">
                  {res.content}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SearchPanel;
