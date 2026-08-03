// ============================================================
// PrismPane — Settings Panel (Modal)
// ============================================================

import { memo, useCallback, useState } from 'react';
import { IconPalette, IconTypography, IconList, IconEye, IconRotateClockwise2, IconSettings, IconMarkdown } from '@tabler/icons-react';
import { cn } from './ui/utils';
import { Modal } from './ui/Modal';
import type { AppSettings, VisibleFilesMode } from '../types';
import { THEMES } from '../features/editor/themes';

interface SettingsPanelProps {
  settings: AppSettings;
  onUpdateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onClose: () => void;
  onReset: () => void;
}

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 24] as const;
const TAB_SIZES = [2, 4, 8] as const;
const JSON_INDENT_SIZES = [2, 4, 8] as const;
const CHECK_SEVERITY_OPTIONS = [
  { value: 'warning', label: 'Warn' },
  { value: 'error', label: 'Block Save' },
] as const;
const VISIBLE_FILE_OPTIONS: ReadonlyArray<{ value: VisibleFilesMode; label: string }> = [
  { value: 'markdown', label: 'Just .md' },
  { value: 'json', label: 'Just .json' },
  { value: 'markdown-json', label: 'Both .md and .json' },
  { value: 'folders', label: 'Just folders' },
  { value: 'all', label: 'All files' },
];

const SettingsPanel = memo(function SettingsPanel({
  settings,
  onUpdateSetting,
  onClose,
  onReset,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'appearance' | 'editor' | 'markdown' | 'json' | 'quality' | 'system'>('appearance');
  const handleThemeChange = useCallback(
    (id: string) => onUpdateSetting('themeId', id),
    [onUpdateSetting],
  );

  const handleFontSize = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      onUpdateSetting('fontSize', Number(e.target.value)),
    [onUpdateSetting],
  );

  const handleTabSize = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      onUpdateSetting('tabSize', Number(e.target.value)),
    [onUpdateSetting],
  );

  const handleJsonIndentSize = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      onUpdateSetting('jsonIndentSize', Number(e.target.value)),
    [onUpdateSetting],
  );

  const handleVisibleFilesChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      onUpdateSetting('visibleFiles', e.target.value as VisibleFilesMode),
    [onUpdateSetting],
  );

  return (
    <Modal
      title="Settings"
      icon={<IconSettings className="h-5 w-5" stroke={1.75} />}
      onClose={onClose}
      widthClass="w-[50vw] max-w-[50vw]"
      heightClass="h-[80vh] max-h-[80vh]"
      className="prismpane-settings-panel"
      bodyClassName="p-0 overflow-hidden flex flex-col"
    >
      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-52 flex-shrink-0 border-r py-4 px-3 space-y-1 overflow-y-auto" style={{ borderColor: 'var(--toolbar-border)' }}>
             <TabButton id="appearance" icon={IconPalette} label="Appearance" active={activeTab === 'appearance'} onClick={setActiveTab} />
             <TabButton id="editor" icon={IconTypography} label="Editor" active={activeTab === 'editor'} onClick={setActiveTab} />
             <TabButton id="markdown" icon={IconMarkdown} label="Markdown" active={activeTab === 'markdown'} onClick={setActiveTab} />
             <TabButton id="json" icon={IconList} label="JSON" active={activeTab === 'json'} onClick={setActiveTab} />
             <TabButton id="quality" icon={IconEye} label="Quality & Safety" active={activeTab === 'quality'} onClick={setActiveTab} />
             <TabButton id="system" icon={IconSettings} label="System" active={activeTab === 'system'} onClick={setActiveTab} />
          </div>
          
          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10">
            {/* Appearance Preferences */}
            {activeTab === 'appearance' && (
              <section className="space-y-6">
                <div>
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70 mb-5">
                    <IconPalette className="h-4 w-4" stroke={1.75} />
                    Color Theme
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    {THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => handleThemeChange(theme.id)}
                        className={cn(
                          'relative flex flex-col items-center gap-2.5 p-5 rounded-xl border transition-all',
                          'hover:scale-[1.02]',
                          settings.themeId === theme.id
                            ? 'ring-2 ring-offset-1'
                            : 'opacity-70 hover:opacity-100',
                        )}
                        style={{
                          borderColor:
                            settings.themeId === theme.id
                              ? theme.colors.heading
                              : 'var(--toolbar-border)',
                          backgroundColor: theme.colors.background,
                          color: theme.colors.foreground,
                          ...(settings.themeId === theme.id
                            ? { ringColor: theme.colors.heading, ringOffsetColor: 'var(--toolbar-bg)' }
                            : {}),
                        }}
                      >
                        {/* Mini preview swatches */}
                        <div className="flex gap-0.5">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.colors.heading1 }} />
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.colors.heading2 }} />
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.colors.heading3 }} />
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.colors.code }} />
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.colors.bold }} />
                        </div>
                        <span className="text-[10px] font-medium truncate w-full text-center">
                          {theme.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size moved to Appearance */}
                <div className="flex items-center justify-between pt-2">
                  <label className="text-xs opacity-80 font-medium">Font Size</label>
                  <select
                    value={settings.fontSize}
                    onChange={handleFontSize}
                    className="form-select form-select-sm px-4 py-2.5 text-xs rounded-lg border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--toolbar-bg)',
                      color: 'var(--toolbar-fg)',
                      borderColor: 'var(--toolbar-border)',
                      colorScheme: 'dark',
                    }}
                  >
                    {FONT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}px
                      </option>
                    ))}
                  </select>
                </div>

                {/* Line Numbers moved to Appearance */}
                <ToggleOption
                  label="Line Numbers"
                  description="Show line numbers in the gutter"
                  enabled={settings.showLineNumbers}
                  onChange={(v) => onUpdateSetting('showLineNumbers', v)}
                  icon={IconList}
                />

                {/* Highlight Active Line moved to Appearance */}
                <ToggleOption
                  label="Highlight Active Line"
                  description="Visually highlight the line under the cursor"
                  enabled={settings.showActiveLine}
                  onChange={(v) => onUpdateSetting('showActiveLine', v)}
                  icon={IconEye}
                />
              </section>
            )}

          {/* General Editor Preferences */}
          {activeTab === 'editor' && (
            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70 mb-5">
                <IconTypography className="h-4 w-4" stroke={1.75} />
                Editor
              </h3>
              <div className="space-y-6">
                {/* Tab Size */}
                <div className="flex items-center justify-between">
                  <label className="text-xs opacity-80 font-medium">Tab Size</label>
                  <select
                    value={settings.tabSize}
                    onChange={handleTabSize}
                    className="form-select form-select-sm px-4 py-2.5 text-xs rounded-lg border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--toolbar-bg)',
                      color: 'var(--toolbar-fg)',
                      borderColor: 'var(--toolbar-border)',
                      colorScheme: 'dark',
                    }}
                  >
                    {TAB_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} spaces
                      </option>
                    ))}
                  </select>
                </div>

                {/* Word Wrap */}
                <ToggleOption
                  label="Word Wrap"
                  description="Wrap long lines to fit the editor width"
                  enabled={settings.wordWrap}
                  onChange={(v) => onUpdateSetting('wordWrap', v)}
                  icon={IconList}
                />

                <ToggleOption
                  label="Native Spellcheck"
                  description="Enable OS/browser spellcheck and typing suggestions in the editor"
                  enabled={settings.spellCheck}
                  onChange={(v) => onUpdateSetting('spellCheck', v)}
                  icon={IconEye}
                />

                {/* Auto Save */}
                <ToggleOption
                  label="Auto Save"
                  description="Automatically save changes to disk"
                  enabled={settings.autoSave}
                  onChange={(v) => onUpdateSetting('autoSave', v)}
                  icon={IconEye}
                />
              </div>
            </section>
          )}

          {/* Markdown Preferences (NEW Tab) */}
          {activeTab === 'markdown' && (
            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70 mb-5">
                <IconMarkdown className="h-4 w-4" stroke={1.75} />
                Markdown
              </h3>
              <div className="space-y-6">
                {/* Markdownlint */}
                <ToggleOption
                  label="Markdownlint"
                  description="Run markdownlint rules for Markdown documents"
                  enabled={settings.enableMarkdownLint}
                  onChange={(v) => onUpdateSetting('enableMarkdownLint', v)}
                  icon={IconList}
                />
                {settings.enableMarkdownLint && (
                  <div className="flex items-center justify-between">
                    <label className="text-xs opacity-80 font-medium">Markdownlint Severity</label>
                    <select
                      value={settings.markdownLintSeverity}
                      onChange={(e) => onUpdateSetting('markdownLintSeverity', e.target.value as 'warning' | 'error')}
                      className="form-select form-select-sm px-4 py-2.5 text-xs rounded-lg border cursor-pointer"
                      style={{
                        backgroundColor: 'var(--toolbar-bg)',
                        color: 'var(--toolbar-fg)',
                        borderColor: 'var(--toolbar-border)',
                        colorScheme: 'dark',
                      }}
                    >
                      {CHECK_SEVERITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Markdown Icon Helper Package */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <label className="text-xs opacity-80 font-medium">Markdown Icon Helper Package</label>
                    <div className="text-[10px] opacity-50 mt-0.5">Detects icon names and displays inline icon swatches</div>
                  </div>
                  <select
                    value={settings.iconHelperMdPackage}
                    onChange={(e) => onUpdateSetting('iconHelperMdPackage', e.target.value as any)}
                    className="form-select form-select-sm px-4 py-2.5 text-xs rounded-lg border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--toolbar-bg)',
                      color: 'var(--toolbar-fg)',
                      borderColor: 'var(--toolbar-border)',
                      colorScheme: 'dark',
                    }}
                  >
                    <option value="off">Off (Default)</option>
                    <option value="phosphor">Phosphor Icons</option>
                    <option value="bootstrap">Bootstrap</option>
                    <option value="lucide">Lucide</option>
                    <option value="iconoir">Iconoir</option>
                    <option value="tabler">Tabler</option>
                    <option value="material">Google Material Symbols</option>
                    <option value="boxicons">Boxicons</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'json' && (
          <section>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70 mb-5">
              <IconList className="h-4 w-4" stroke={1.75} />
              JSON
            </h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-xs opacity-80 font-medium">JSON Indent Size</label>
                  <div className="text-[10px] opacity-50 mt-0.5">Used for auto-formatting JSON documents</div>
                </div>
                <select
                  value={settings.jsonIndentSize}
                  onChange={handleJsonIndentSize}
                  className="form-select form-select-sm px-4 py-2.5 text-xs rounded-lg border cursor-pointer"
                  style={{
                    backgroundColor: 'var(--toolbar-bg)',
                    color: 'var(--toolbar-fg)',
                    borderColor: 'var(--toolbar-border)',
                    colorScheme: 'dark',
                  }}
                >
                  {JSON_INDENT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} spaces
                    </option>
                  ))}
                </select>
              </div>

              <ToggleOption
                label="Format JSON on Open"
                description="Pretty-print .json files when you open them"
                enabled={settings.formatJsonOnOpen}
                onChange={(v) => onUpdateSetting('formatJsonOnOpen', v)}
                icon={IconList}
              />

              <ToggleOption
                label="JSON Fold Controls"
                description="Show collapsible bracket controls in the editor gutter"
                enabled={settings.showJsonFoldGutter}
                onChange={(v) => onUpdateSetting('showJsonFoldGutter', v)}
                icon={IconEye}
              />

              {/* JSON Schema Validation moved here */}
              <ToggleOption
                label="JSON Schema Validation"
                description="Validate JSON files using SchemaStore catalog mappings"
                enabled={settings.enableJsonSchemaLint}
                onChange={(v) => onUpdateSetting('enableJsonSchemaLint', v)}
                icon={IconList}
              />
              {settings.enableJsonSchemaLint && (
                <div className="flex items-center justify-between">
                  <label className="text-xs opacity-80 font-medium">JSON Schema Severity</label>
                  <select
                    value={settings.jsonSchemaSeverity}
                    onChange={(e) => onUpdateSetting('jsonSchemaSeverity', e.target.value as 'warning' | 'error')}
                    className="form-select form-select-sm px-4 py-2.5 text-xs rounded-lg border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--toolbar-bg)',
                      color: 'var(--toolbar-fg)',
                      borderColor: 'var(--toolbar-border)',
                      colorScheme: 'dark',
                    }}
                  >
                    {CHECK_SEVERITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* JSON Icon Helper Package */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-xs opacity-80 font-medium">JSON Icon Helper Package</label>
                  <div className="text-[10px] opacity-50 mt-0.5">Detects icon names and displays inline icon swatches</div>
                </div>
                <select
                  value={settings.iconHelperJsonPackage}
                  onChange={(e) => onUpdateSetting('iconHelperJsonPackage', e.target.value as any)}
                  className="form-select form-select-sm px-4 py-2.5 text-xs rounded-lg border cursor-pointer"
                  style={{
                    backgroundColor: 'var(--toolbar-bg)',
                    color: 'var(--toolbar-fg)',
                    borderColor: 'var(--toolbar-border)',
                    colorScheme: 'dark',
                  }}
                >
                  <option value="off">Off</option>
                  <option value="phosphor">Phosphor Icons (Default)</option>
                  <option value="bootstrap">Bootstrap</option>
                  <option value="lucide">Lucide</option>
                  <option value="iconoir">Iconoir</option>
                  <option value="tabler">Tabler</option>
                  <option value="material">Google Material Symbols</option>
                  <option value="boxicons">Boxicons</option>
                </select>
              </div>
            </div>
          </section>
            )}

          {activeTab === 'quality' && (
          <section>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70 mb-5">
              <IconEye className="h-4 w-4" stroke={1.75} />
              Quality and Safety
            </h3>
            <div className="space-y-6">
              <ToggleOption
                label="Link Check (lychee-lib)"
                description="Check links in Markdown before saving"
                enabled={settings.enableLinkCheck}
                onChange={(v) => onUpdateSetting('enableLinkCheck', v)}
                icon={IconList}
              />
              {settings.enableLinkCheck && (
                <div className="flex items-center justify-between">
                  <label className="text-xs opacity-80 font-medium">Link Check Severity</label>
                  <select
                    value={settings.linkCheckSeverity}
                    onChange={(e) => onUpdateSetting('linkCheckSeverity', e.target.value as 'warning' | 'error')}
                    className="form-select form-select-sm px-4 py-2.5 text-xs rounded-lg border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--toolbar-bg)',
                      color: 'var(--toolbar-fg)',
                      borderColor: 'var(--toolbar-border)',
                      colorScheme: 'dark',
                    }}
                  >
                    {CHECK_SEVERITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <ToggleOption
                label="Secret Scan (ripsecrets)"
                description="Scan content for secret-like tokens"
                enabled={settings.enableSecretScan}
                onChange={(v) => onUpdateSetting('enableSecretScan', v)}
                icon={IconList}
              />
              <ToggleOption
                label="Block Save on Secrets"
                description="Prevent save when ripsecrets finds potential secrets"
                enabled={settings.blockSaveOnSecrets}
                onChange={(v) => onUpdateSetting('blockSaveOnSecrets', v)}
                icon={IconEye}
              />
            </div>
          </section>
            )}

          {/* System Preferences */}
          {activeTab === 'system' && (
            <section>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70 mb-5">
              <IconEye className="h-4 w-4" stroke={1.75} />
              System
            </h3>
            <div className="space-y-6">
              <ToggleOption
                label="Associate with .md Files"
                description="Open .md files directly into the app"
                enabled={settings.associateMdFiles}
                onChange={(v) => onUpdateSetting('associateMdFiles', v)}
                icon={IconList}
              />
              <ToggleOption
                label="Associate with .json Files"
                description="Open .json files directly into the app"
                enabled={settings.associateJsonFiles}
                onChange={(v) => onUpdateSetting('associateJsonFiles', v)}
                icon={IconList}
              />
              <div className="flex items-center justify-between py-1.5 gap-4">
                <div className="flex items-center gap-2.5">
                  <IconList className="h-4 w-4 opacity-50" stroke={1.75} />
                  <div>
                    <div className="text-xs font-medium">Visible Files</div>
                    <div className="text-[10px] opacity-50 mt-0.5">Choose which files appear in the folder tree and search results</div>
                  </div>
                </div>
                <select
                  value={settings.visibleFiles}
                  onChange={handleVisibleFilesChange}
                  className="form-select form-select-sm px-4 py-2.5 text-xs rounded-lg border cursor-pointer min-w-[180px]"
                  style={{
                    backgroundColor: 'var(--toolbar-bg)',
                    color: 'var(--toolbar-fg)',
                    borderColor: 'var(--toolbar-border)',
                    colorScheme: 'dark',
                  }}
                >
                  {VISIBLE_FILE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <ToggleOption
                label="Use Full Path"
                description="Use absolute paths when inserting files or folders"
                enabled={settings.useFullPath}
                onChange={(v) => onUpdateSetting('useFullPath', v)}
                icon={IconList}
              />
              <div className="flex items-center justify-between py-1.5">
                <div className="flex flex-col">
                  <div className="text-xs font-medium">Reset Hints</div>
                  <div className="text-[10px] opacity-50 mt-0.5">Show all hints and tooltips again</div>
                </div>
                <button
                  onClick={() => {
                    onUpdateSetting('showZenModeHint', true);
                    onUpdateSetting('showTypewriterModeHint', true);
                  }}
                  className="btn btn-sm px-4 py-1.5 text-xs font-medium rounded border transition-colors hover:bg-white/10"
                  style={{ borderColor: 'var(--toolbar-border)' }}
                >
                  Reset Hints
                </button>
              </div>
            </div>
          </section>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-8 py-5 border-t"
          style={{ borderColor: 'var(--toolbar-border)' }}
        >
          <button
            onClick={onReset}
              className="btn flex items-center gap-2.5 px-6 py-3 text-xs rounded-lg hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
            title="Reset all settings to defaults"
          >
            <IconRotateClockwise2 className="h-3 w-3" stroke={1.75} />
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
              className="btn btn-primary px-7 py-3 text-xs font-medium rounded-lg transition-colors"
            style={{
              backgroundColor: 'var(--sidebar-active)',
              color: '#000',
            }}
          >
            Done
          </button>
        </div>
    </Modal>
  );
});

/** Reusable toggle switch for boolean settings */
function ToggleOption({
  label,
  description,
  enabled,
  onChange,
  icon: Icon,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
      <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 opacity-50" />
        <div>
          <div className="text-xs font-medium">{label}</div>
          <div className="text-[10px] opacity-50 mt-0.5">{description}</div>
        </div>
      </div>
      <label className="form-check form-switch m-0 cursor-pointer">
        <input
          type="checkbox"
          role="switch"
          aria-checked={enabled}
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className={cn('form-check-input')}
          style={{
            backgroundColor: enabled ? 'var(--sidebar-active)' : undefined,
            borderColor: 'var(--toolbar-border)',
          }}
        />
      </label>
    </div>
  );
}

function TabButton({
  id,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  id: any;
  icon: any;
  label: string;
  active: boolean;
  onClick: (id: any) => void;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left',
        active ? 'bg-black/10 dark:bg-white/10' : 'opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
      )}
      style={{
        backgroundColor: active ? 'var(--sidebar-active)' : undefined,
      }}
    >
      <Icon className="h-4 w-4" stroke={1.75} />
      {label}
    </button>
  );
}

export default SettingsPanel;