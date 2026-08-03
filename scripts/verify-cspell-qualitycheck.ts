import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { AppSettings } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';

interface CSpellIssue {
  text: string;
  message: string;
  line?: number;
  column?: number;
  suggestions?: string[];
}

function runCommand(command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; launchError?: string } {
  try {
    const isWindowsCmdScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
    const spawnCommand = isWindowsCmdScript ? 'cmd.exe' : command;
    const spawnArgs = isWindowsCmdScript ? ['/C', command, ...args] : args;

    const result = spawnSync(spawnCommand, spawnArgs, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return {
      ok: typeof result.status === 'number',
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      launchError: result.error?.message,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      launchError: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseCspellIssues(stdout: string): CSpellIssue[] {
  const value = JSON.parse(stdout) as {
    issues?: Array<{ text?: string; message?: string; row?: number; line?: number; col?: number; column?: number; suggestions?: string[] }>;
    files?: Array<{
      issues?: Array<{ text?: string; message?: string; row?: number; line?: number; col?: number; column?: number; suggestions?: string[] }>;
    }>;
  };

  const out: CSpellIssue[] = [];

  const collect = (entries?: Array<{ text?: string; message?: string; row?: number; line?: number; col?: number; column?: number; suggestions?: string[] }>) => {
    if (!entries) return;
    for (const entry of entries) {
      const text = entry.text ?? 'unknown';
      out.push({
        text,
        message: entry.message ?? `Spelling: "${text}"`,
        line: entry.row ?? entry.line,
        column: entry.col ?? entry.column,
        suggestions: entry.suggestions ?? [],
      });
    }
  };

  collect(value.issues);
  for (const file of value.files ?? []) {
    collect(file.issues);
  }

  return out;
}

function invokeCspellLikeBackend(content: string, languageId: string): CSpellIssue[] {
  const extension = languageId === 'json' ? 'json' : languageId === 'markdown' ? 'md' : 'txt';
  const cspellLanguage = languageId === 'json' ? 'json' : languageId === 'markdown' ? 'markdown' : 'plaintext';

  const tmpRoot = mkdtempSync(join(tmpdir(), 'prismpane-cspell-'));
  const tmpFile = join(tmpRoot, `doc.${extension}`);
  writeFileSync(tmpFile, content, 'utf8');
  const fileArg = `file:///${tmpFile.replace(/\\/g, '/')}`;

  const localCspellCmd = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'cspell.cmd' : 'cspell');
  const localNpxCmd = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'npx.cmd' : 'npx');

  const directArgs = [
    'lint',
    '--no-progress',
    '--no-summary',
    '--no-must-find-files',
    '--reporter',
    '@cspell/cspell-json-reporter',
    '--language-id',
    cspellLanguage,
    fileArg,
  ];

  const launchAttempts: Array<{ cmd: string; args: string[] }> = [
    { cmd: localCspellCmd, args: directArgs },
    { cmd: 'cspell', args: directArgs },
    {
      cmd: localNpxCmd,
      args: ['--yes', 'cspell', ...directArgs],
    },
    {
      cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['--yes', 'cspell', ...directArgs],
    },
  ];

  let launchErrors: string[] = [];
  let finalStdout = '';
  let finalStderr = '';

  try {
    for (const attempt of launchAttempts) {
      const result = runCommand(attempt.cmd, attempt.args);
      if (!result.ok) {
        launchErrors.push(`${attempt.cmd}: ${result.launchError ?? 'failed to launch'}`);
        continue;
      }

      finalStdout = result.stdout;
      finalStderr = result.stderr;
      break;
    }

    if (!finalStdout.trim()) {
      if (finalStderr.trim()) {
        throw new Error(finalStderr.trim());
      }

      if (launchErrors.length > 0) {
        throw new Error(`Unable to start cspell: ${launchErrors.join(' | ')}`);
      }

      return [];
    }

    return parseCspellIssues(finalStdout);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
    originalWarn(...args);
  };

  // Provide a lightweight Tauri invoke surface so runQualityChecks executes its real frontend path.
  (globalThis as typeof globalThis & {
    window: {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
      };
    };
  }).window = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args: Record<string, unknown>) => {
        if (command !== 'check_spelling_with_cspell') {
          throw new Error(`Unsupported command in test harness: ${command}`);
        }

        return invokeCspellLikeBackend(String(args.content ?? ''), String(args.languageId ?? 'text'));
      },
    },
  };

  const { runQualityChecks } = await import('../src/services/qualityChecks');

  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    enableCspellLint: true,
    enableMarkdownLint: false,
    enableJsonSchemaLint: false,
    enableLinkCheck: false,
    enableSecretScan: false,
    blockSaveOnSecrets: false,
  };

  const issues = await runQualityChecks({
    fileIdentity: 'demo.md',
    filePath: 'demo.md',
    content: 'This has a speling mistake.',
    documentType: 'markdown',
    settings,
    phase: 'live',
  });

  console.warn = originalWarn;

  const cspellFailedWarning = warnings.find((line) => /cspell failed/i.test(line));
  const pathWarning = warnings.find((line) => /cannot find the path|unable to start cspell/i.test(line));
  const cspellFallbackIssue = issues.find((issue) => issue.message === 'CSpell failed to run.');
  const firstIssueSuggestions = issues[0]?.suggestions ?? [];

  if (cspellFailedWarning || pathWarning || cspellFallbackIssue) {
    throw new Error([
      'Frontend qualityChecks cspell path still failing.',
      cspellFailedWarning ? `warn=${cspellFailedWarning}` : '',
      pathWarning ? `pathWarn=${pathWarning}` : '',
      cspellFallbackIssue ? `fallbackIssue=${cspellFallbackIssue.message}` : '',
    ].filter(Boolean).join(' '));
  }

  if (issues.length > 0 && firstIssueSuggestions.length === 0) {
    throw new Error('Expected cspell suggestions for first misspelling, got none.');
  }

  console.log('qualityChecks.ts cspell invocation status: ok');
  console.log('qualityChecks.ts warning count:', warnings.length);
  console.log('qualityChecks.ts issue count:', issues.length);
  console.log('qualityChecks.ts first issue:', issues[0]?.message ?? '(none)');
  console.log('qualityChecks.ts first issue suggestions:', firstIssueSuggestions.join(', ') || '(none)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
