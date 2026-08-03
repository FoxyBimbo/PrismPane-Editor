import { memo, useState } from 'react';
import { IconFolderOpen, IconFileText, IconAlignLeft, IconSearch, IconAlertTriangle } from '@tabler/icons-react';
import FolderTree from './FolderTree';
import type { TreeNode } from './FolderTree';
import OutlinePanel from './OutlinePanel';
import SearchPanel from './SearchPanel';
import type { SearchResult } from './SearchPanel';
import type { VisibleFilesMode } from '../types';
import ProblemsPanel from './ProblemsPanel';
import type { QualityIssue } from '../services/qualityChecks';

interface SidebarProps {
  folderPath: string | null;
  folderTree: TreeNode[];
  expandedFolders: Set<string>;
  onToggleExpand: (path: string) => void;
  onFileOpen: (filePath: string) => void;
  onSearchResultClick: (result: SearchResult, options: { query: string; isRegex: boolean; matchCase: boolean }) => void;
  onFileRename: (oldPath: string, newName: string) => void;
  onFileAction: (action: 'saveAs' | 'exportPdf' | 'exportHtml' | 'print' | 'share' | 'duplicate', filePath: string) => void;
  onOpenFolder: () => void;
  selectedFolderPath: string | null;
  onSelectFolder: (path: string | null) => void;
  sidebarBg: string;
  sidebarFg: string;
  sidebarBorder: string;
  activeColor: string;
  activeFilePath: string | null;
  activeFileContent: string | null;
  onNavigateToLine: (lineNumber: number) => void;
  visibleFiles: VisibleFilesMode;
  problems: QualityIssue[];
  onProblemClick: (issue: QualityIssue) => void;
  activeTab?: SidebarTab;
  onActiveTabChange?: (tab: SidebarTab) => void;
  searchPanelOpenToken?: number;
}

export type SidebarTab = 'files' | 'outline' | 'search' | 'problems';

const Sidebar = memo(function Sidebar({
  folderPath,
  folderTree,
  expandedFolders,
  onToggleExpand,
  onFileOpen,
  onSearchResultClick,
  onFileRename,
  onFileAction,
  onOpenFolder,
  selectedFolderPath,
  onSelectFolder,
  sidebarBg,
  sidebarFg,
  sidebarBorder,
  activeColor,
  activeFilePath,
  activeFileContent,
  onNavigateToLine,
  visibleFiles,
  problems,
  onProblemClick,
  activeTab: controlledActiveTab,
  onActiveTabChange,
  searchPanelOpenToken = 0,
}: SidebarProps) {
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<SidebarTab>('files');
  const activeTab = controlledActiveTab ?? uncontrolledActiveTab;
  const setActiveTab = onActiveTabChange ?? setUncontrolledActiveTab;

  // Translate a tree-relative path back to a real filesystem path.
  const resolveRealPath = (treePath: string): string => {
    if (!folderPath) return treePath;
    const rootName = folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
    const prefix = '/' + rootName + '/';
    if (treePath.startsWith(prefix)) {
      return folderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/' + treePath.slice(prefix.length);
    }
    if (treePath === '/' + rootName) {
      return folderPath;
    }
    return folderPath + '/' + treePath.replace(/^\//, '');
  };

  const handleFileOpen = (treePath: string) => {
    onFileOpen(resolveRealPath(treePath));
  };

  const handleFileRename = (treePath: string, newName: string) => {
    onFileRename(resolveRealPath(treePath), newName);
  };

  const handleFileAction = (action: 'saveAs' | 'exportPdf' | 'exportHtml' | 'print' | 'share' | 'duplicate', treePath: string) => {
    onFileAction(action, resolveRealPath(treePath));
  };

  const handleSearchClick = (result: SearchResult, options: { query: string; isRegex: boolean; matchCase: boolean }) => {
    if (result.type === 'folder') {
      setActiveTab('files');
    }
    onSearchResultClick(result, options);
  };

  const resolveTreePath = (realPath: string | null): string | null => {
    if (!realPath || !folderPath) return null;
    const normReal = realPath.replace(/\\/g, '/');
    const normFolder = folderPath.replace(/\\/g, '/').replace(/\/$/, '');
    if (normReal.startsWith(normFolder)) {
      const rootName = normFolder.split('/').filter(Boolean).pop() || '';
      return '/' + rootName + normReal.slice(normFolder.length);
    }
    return null;
  };

  return (
    <aside
      className="card flex flex-col h-full w-56 shrink-0 border-r glass backdrop-blur-xl z-20 prismpane-sidebar"
      style={{
        backgroundColor: `color-mix(in srgb, ${sidebarBg} 90%, transparent)`,
        borderColor: sidebarBorder,
        color: sidebarFg,
      }}
    >
      <div className="nav nav-pills flex items-center px-2 py-2 border-b shrink-0 gap-1" style={{ borderColor: `${sidebarFg}15` }}>
        <button
          onClick={() => setActiveTab('files')}
          className={`btn btn-sm flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'files' ? 'bg-white/10' : 'hover:bg-white/5 opacity-50'}`}
          title="Files"
        >
          <IconFileText className="w-4 h-4" stroke={1.75} />
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`btn btn-sm flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'search' ? 'bg-white/10' : 'hover:bg-white/5 opacity-50'}`}
          title="Search"
        >
          <IconSearch className="w-4 h-4" stroke={1.75} />
        </button>
        <button
          onClick={() => setActiveTab('outline')}
          className={`btn btn-sm flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'outline' ? 'bg-white/10' : 'hover:bg-white/5 opacity-50'}`}
          title="Outline"
        >
          <IconAlignLeft className="w-4 h-4" stroke={1.75} />
        </button>
        <button
          onClick={() => setActiveTab('problems')}
          className={`btn btn-sm flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'problems' ? 'bg-white/10' : 'hover:bg-white/5 opacity-50'}`}
          title="Problems"
        >
          <IconAlertTriangle className="w-4 h-4" stroke={1.75} />
        </button>
      </div>

      {activeTab === 'files' && (
        folderPath ? (
          <FolderTree
            rootPath={folderPath}
            tree={folderTree}
            activeFilePath={resolveTreePath(activeFilePath)}
            onFileOpen={handleFileOpen}
            onFileRename={handleFileRename}
            onFileAction={handleFileAction}
            expanded={expandedFolders}
            onToggleExpand={onToggleExpand}
            selectedFolderPath={selectedFolderPath}
            onSelectFolder={onSelectFolder}
            bgColor={sidebarBg}
            fgColor={sidebarFg}
            borderColor={sidebarBorder}
            activeColor={activeColor}
            visibleFiles={visibleFiles}
            resolveRealPath={resolveRealPath}
          />
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6 text-center">
            <IconFolderOpen className="h-10 w-10 opacity-15" stroke={1.75} />
            <div>
              <p className="text-[11px] opacity-40 mb-3">No folder open</p>
              <button
                onClick={onOpenFolder}
                className="btn px-8 py-3.5 text-[12px] font-medium rounded-xl border transition-all duration-300 hover:bg-white/10 active:scale-95 shadow-sm"
                style={{ borderColor: `${sidebarFg}25`, color: sidebarFg }}
              >
                Open Folder
              </button>
            </div>
          </div>
        )
      )}

      {activeTab === 'outline' && (
        <OutlinePanel
          content={activeFileContent}
          onNavigateToLine={onNavigateToLine}
          fgColor={sidebarFg}
        />
      )}

      {activeTab === 'search' && (
        <SearchPanel
          folderPath={folderPath}
          onSearchResultClick={handleSearchClick}
          fgColor={sidebarFg}
          visibleFiles={visibleFiles}
          focusToken={searchPanelOpenToken}
        />
      )}

      {activeTab === 'problems' && (
        <ProblemsPanel
          issues={problems}
          onIssueClick={onProblemClick}
        />
      )}
    </aside>
  );
});

export default Sidebar;