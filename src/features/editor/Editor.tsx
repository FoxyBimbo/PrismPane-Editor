// ============================================================
// PrismPane — CodeMirror 6 React Wrapper Component
// ============================================================

import { useRef, useEffect, useCallback, useReducer, memo, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { Compartment, EditorSelection, StateEffect } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { forEachDiagnostic, type Diagnostic } from '@codemirror/lint';
import { openSearchPanel, closeSearchPanel, findNext, findPrevious, setSearchQuery, SearchQuery, getSearchQuery } from '@codemirror/search';
import { foldAll, unfoldAll, foldedRanges } from '@codemirror/language';
import { copyLineDown, moveLineUp, moveLineDown } from '@codemirror/commands';
import { marked } from 'marked';
import TurndownService from 'turndown';
import type { AppSettings, BlockType, EditorDocumentType } from '../../types';
import { tryFormatJson } from '../../fileUtils';
import { createEditorState, createEditorExtensions, deleteCurrentLine, insertLineAbove, insertLineBelow } from './setup';
import { ColorPickerModal } from '../../components/ColorPickerModal';
import { IconPickerModal } from '../../components/IconPickerModal';
import type { OnIconPickerClick } from './iconHelperPlugin';

import type { QualityIssue } from '../../services/qualityChecks';
import {
  transformLine,
  transformToOrderedList,
  toggleInlineFormat,
  indentListLine,
  unindentListLine,
  detectBlockType,
  LIST_AND_BLOCK_TYPES,
} from '../formatters/blockTransforms';

interface EditorProps {
  content: string;
  settings: AppSettings;
  qualityIssues?: QualityIssue[];
  onContentChange: (content: string) => void;
  onCursorChange?: (pos: number) => void;
  initialCursorPos?: number;
  onRequestDiagnostics?: () => void;
  onDiagnosticsChange?: (diagnostics: Array<{ message: string; severity: 'error' | 'warning' | 'info'; line: number; column: number }>) => void;
  onPasteText?: (text: string) => void;
  folderPath?: string | null;
  documentType?: EditorDocumentType;
}


/**
 * Lightweight React wrapper around a CodeMirror 6 EditorView.
 * Handles mounting, updates via settings/content changes, and exposes
 * imperative block transformation commands via a ref callback.
 */
const Editor = memo(function Editor({
  content,
  settings,
  qualityIssues = [],
  onContentChange,
  onCursorChange,
  initialCursorPos = 0,
  onRequestDiagnostics,
  onDiagnosticsChange,
  onPasteText,
  folderPath,
  documentType = 'markdown',
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const folderPathRef = useRef(folderPath);
  folderPathRef.current = folderPath;
  const documentTypeRef = useRef(documentType);
  documentTypeRef.current = documentType;
  const onPasteTextRef = useRef(onPasteText);
  onPasteTextRef.current = onPasteText;
  const onDiagnosticsChangeRef = useRef(onDiagnosticsChange);
  onDiagnosticsChangeRef.current = onDiagnosticsChange;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const onRequestDiagnosticsRef = useRef(onRequestDiagnostics);
  onRequestDiagnosticsRef.current = onRequestDiagnostics;
  const diagnosticsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const externalUpdateRef = useRef(false);
  const [, forceRender] = useReducer((value: number) => value + 1, 0);

  const [colorPickerTarget, setColorPickerTarget] = useState<{
    from: number;
    to: number;
    colorString: string;
    position: { top: number; left: number };
  } | null>(null);

  const [iconPickerTarget, setIconPickerTarget] = useState<{
    from: number;
    to: number;
    iconName: string;
    packageKey: any;
    position: { top: number; left: number };
  } | null>(null);

  const handleOpenColorPicker = useCallback(
    (targetEl: HTMLElement, from: number, to: number, colorString: string) => {
      const rect = targetEl.getBoundingClientRect();
      setColorPickerTarget({
        from,
        to,
        colorString,
        position: { top: rect.top, left: rect.left },
      });
    },
    [],
  );

  const handleOpenIconPicker = useCallback<OnIconPickerClick>(
    (targetEl, from, to, iconName, packageKey) => {
      const rect = targetEl.getBoundingClientRect();
      setIconPickerTarget({
        from,
        to,
        iconName,
        packageKey,
        position: { top: rect.top, left: rect.left },
      });
    },
    [],
  );


  const handleDocUpdate = useCallback((value: string) => {
    if (externalUpdateRef.current) {
      externalUpdateRef.current = false;
      return;
    }
    onContentChangeRef.current(value);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Permissive drag over
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    const rawPath = e.dataTransfer.getData('prismpane-file') || e.dataTransfer.getData('text/plain');
    
    // Only intercept if we have a path from the folder tree (heuristic: absolute path or starts with root)
    if (!rawPath || (!rawPath.includes('/') && !rawPath.includes('\\'))) {
       return; // Let CodeMirror handle it (e.g. dragging text)
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const view = viewRef.current;
    if (!view) return;
    
    let pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) pos = view.state.doc.length;
    
    let finalPath = rawPath.replace(/\\/g, '/');
    if (!settingsRef.current.useFullPath && folderPathRef.current) {
      const normFolder = folderPathRef.current.replace(/\\/g, '/').replace(/\/$/, '') + '/';
      if (finalPath.startsWith(normFolder)) {
         finalPath = finalPath.slice(normFolder.length);
      } else {
         finalPath = `file:///${finalPath}`;
      }
    } else {
      finalPath = `file:///${finalPath}`;
    }
    
    const activeDocumentType = documentTypeRef.current;
    let insertText = finalPath;

    if (activeDocumentType === 'markdown') {
      let name = rawPath.split(/[/\\]/).pop() || 'file';
      if (/\.(md|markdown|txt)$/i.test(name)) {
        name = name.replace(/\.(md|markdown|txt)$/i, '');
      }
      insertText = `[${name}](${finalPath})`;
    } else if (activeDocumentType === 'json') {
      insertText = JSON.stringify(finalPath);
    }
    
    view.dispatch({
      changes: { from: pos, to: pos, insert: insertText },
      selection: { anchor: pos + insertText.length }
    });
    view.focus();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
    };

    const onPasteCapture = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain');
      if (!pastedText) return;
      onPasteTextRef.current?.(pastedText);
    };

    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragenter', onDragEnter);
    container.addEventListener('paste', onPasteCapture, true);
    return () => {
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('dragenter', onDragEnter);
      container.removeEventListener('paste', onPasteCapture, true);
    };
  }, []);

  // Mount editor
  useEffect(() => {
    if (!containerRef.current) return;

    const state = createEditorState(content, settings, documentType, [], initialCursorPos, handleOpenColorPicker, handleOpenIconPicker);
    const view = new EditorView({
      state,
      parent: containerRef.current,
      dispatchTransactions: (trs) => {
        view.update(trs);
        if (trs.some((tr) => tr.docChanged)) {
          // Defer diagnostics collection out of the keystroke hot path.
          if (diagnosticsDebounceRef.current) {
            clearTimeout(diagnosticsDebounceRef.current);
          }
          diagnosticsDebounceRef.current = setTimeout(() => {
            const diagnostics: Array<{ message: string; severity: 'error' | 'warning' | 'info'; line: number; column: number }> = [];
            forEachDiagnostic(view.state, (diag) => {
              const line = view.state.doc.lineAt(diag.from);
              diagnostics.push({
                message: diag.message,
                severity: (diag.severity ?? 'warning') as 'error' | 'warning' | 'info',
                line: line.number,
                column: diag.from - line.from + 1,
              });
            });
            onDiagnosticsChangeRef.current?.(diagnostics);
          }, 150);

          handleDocUpdate(view.state.doc.toString());

          let isWordBoundary = false;
          trs.forEach((tr) => {
            tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
              if (inserted.length > 0) {
                const text = inserted.toString();
                // Trigger on any non-word character (spaces, punctuation, etc)
                if (/\W$/.test(text)) {
                  isWordBoundary = true;
                }
              }
            });
          });

          if (isWordBoundary) {
            onRequestDiagnosticsRef.current?.();
          }
        }
        if (trs.some((tr) => tr.selection)) {
          onCursorChangeRef.current?.(view.state.selection.main.head);
        }
      },
    });

    const initialDiagnostics: Array<{ message: string; severity: 'error' | 'warning' | 'info'; line: number; column: number }> = [];
    forEachDiagnostic(view.state, (diag) => {
      const line = view.state.doc.lineAt(diag.from);
      initialDiagnostics.push({
        message: diag.message,
        severity: (diag.severity ?? 'warning') as 'error' | 'warning' | 'info',
        line: line.number,
        column: diag.from - line.from + 1,
      });
    });
    onDiagnosticsChangeRef.current?.(initialDiagnostics);

    viewRef.current = view;
    requestAnimationFrame(() => {
      if (viewRef.current) {
        viewRef.current.focus();
      }
    });
    return () => {
      if (diagnosticsDebounceRef.current) {
        clearTimeout(diagnosticsDebounceRef.current);
      }
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Sync external content changes into the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentContent = view.state.doc.toString();
    if (content !== currentContent) {
      externalUpdateRef.current = true;
      const main = view.state.selection.main;
      const anchor = Math.min(main.anchor, content.length);
      const head = Math.min(main.head, content.length);
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
        selection: { anchor, head }
      });
    }
  }, [content]);

  // Apply setting changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    
    view.dispatch({
      effects: StateEffect.reconfigure.of(createEditorExtensions(settings, documentType, [], handleOpenColorPicker, handleOpenIconPicker))
    });
  }, [settings, documentType, handleOpenColorPicker, handleOpenIconPicker]);


  // Imperative methods exposed via data attribute for parent control
  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current as HTMLDivElement & {
        applyBlockTransform?: (type: BlockType) => void;
        toggleInlineFormatting?: (wrapper: string) => void;
        indentList?: () => void;
        unindentList?: () => void;
        openFindPanel?: () => void;
        closeFindPanel?: () => void;
        openFindPanelWithQuery?: (query: string, useRegEx: boolean, matchCase: boolean) => void;
        findNext?: () => void;
        findPrevious?: () => void;
        openReplacePanel?: () => void;
        insertTime?: () => void;
        insertDate?: () => void;
        insertTimestamp?: () => void;
        copyAsHtml?: () => void;
        pasteFromHtml?: () => void;
        duplicateLine?: () => void;
        moveLineUp?: () => void;
        moveLineDown?: () => void;
        deleteLine?: () => void;
        insertLineAbove?: () => void;
        insertLineBelow?: () => void;
        transformCase?: () => void;
        scrollToLine?: (lineNum: number, column?: number) => void;
        insertTable?: () => void;
        insertLink?: () => void;
        insertCustomLink?: (name: string, url: string) => void;
        insertImage?: () => void;
        toggleTask?: () => void;
        generateTOC?: () => void;
        formatDocument?: () => void;
        expandCollapseAllJson?: () => void;
        minifyPrettifyJson?: () => void;
        sortJsonKeys?: () => void;
        generateJsonSchema?: () => void;
        insertText?: (text: string) => void;
      };

      el.applyBlockTransform = (type: BlockType) => {
        const view = viewRef.current;
        if (!view) return;

        const { state } = view;
        const { selection } = state;
        const changes: { from: number; to: number; insert: string }[] = [];
        let newHead = selection.main.head;

        const ranges = selection.ranges;

        // Collect all affected lines across all ranges
        const seenLines = new Set<number>();
        const lineEntries: { line: ReturnType<typeof state.doc.line>; lineNum: number }[] = [];

        for (const range of ranges) {
          const fromLine = state.doc.lineAt(range.from);
          const toLine = state.doc.lineAt(range.to);

          for (let i = fromLine.number; i <= toLine.number; i++) {
            if (seenLines.has(i)) continue;
            seenLines.add(i);
            const line = state.doc.line(i);
            lineEntries.push({ line, lineNum: i });
          }
        }

        // Determine if this is a toggleable type that uses all-or-nothing logic
        const isToggleableType = LIST_AND_BLOCK_TYPES.includes(type);
        const totalLines = lineEntries.length;

        if (isToggleableType && totalLines > 1) {
          // All-or-nothing toggle for multi-line selections:
          // If ALL lines already match the target type → toggle all to paragraph
          // If SOME or NONE match → convert all to the target type
          const allMatch = lineEntries.every(
            ({ line }) => detectBlockType(line.text) === type,
          );

          if (allMatch) {
            // Toggle all to paragraph
            for (const { line } of lineEntries) {
              const newText = transformLine(line.text, 'paragraph');
              changes.push({ from: line.from, to: line.to, insert: newText });
            }
          } else if (type === 'orderedList') {
            // Convert all to ordered list with sequential numbering
            for (let idx = 0; idx < lineEntries.length; idx++) {
              const { line } = lineEntries[idx];
              const newText = transformToOrderedList(line.text, idx + 1);
              changes.push({ from: line.from, to: line.to, insert: newText });
            }
          } else {
            // Convert all to the target type
            for (const { line } of lineEntries) {
              const newText = transformLine(line.text, type);
              changes.push({ from: line.from, to: line.to, insert: newText });
            }
          }
        } else if (isToggleableType && totalLines === 1) {
          // Single line: if already this type, toggle to paragraph
          const { line } = lineEntries[0];
          const detected = detectBlockType(line.text);
          if (detected === type) {
            const newText = transformLine(line.text, 'paragraph');
            changes.push({ from: line.from, to: line.to, insert: newText });
          } else if (type === 'orderedList') {
            const newText = transformLine(line.text, type);
            changes.push({ from: line.from, to: line.to, insert: newText });
          } else {
            const newText = transformLine(line.text, type);
            changes.push({ from: line.from, to: line.to, insert: newText });
          }
        } else {
          // Non-toggleable types or paragraph: always apply
          for (const { line } of lineEntries) {
            const newText = transformLine(line.text, type);
            changes.push({ from: line.from, to: line.to, insert: newText });
          }
        }

        // Update cursor to end of first transformed line
        if (changes.length > 0) {
          newHead = changes[0].from + changes[0].insert.length;
          view.dispatch({
            changes,
            selection: EditorSelection.cursor(newHead),
          });
        }
      };

      el.toggleInlineFormatting = (wrapper: string) => {
        const view = viewRef.current;
        if (!view) return;

        const { state } = view;
        const { selection } = state;
        const changes: { from: number; to: number; insert: string }[] = [];

        for (const range of selection.ranges) {
          const selectedText = state.doc.sliceString(range.from, range.to);
          const result = toggleInlineFormat(selectedText, wrapper);
          changes.push({ from: range.from, to: range.to, insert: result.newText });
        }

        if (changes.length > 0) {
          const newRanges = selection.ranges.map((range) => {
            const selectedText = state.doc.sliceString(range.from, range.to);
            const result = toggleInlineFormat(selectedText, wrapper);
            return EditorSelection.range(range.from, range.from + result.newText.length);
          });

          view.dispatch({
            changes,
            selection: EditorSelection.create(newRanges),
          });
        }
      };

      el.expandCollapseAllJson = () => {
        const view = viewRef.current;
        if (!view) return;
        const folded = foldedRanges(view.state).iter();
        if (folded.value) {
          unfoldAll(view);
        } else {
          foldAll(view);
        }
      };

      el.minifyPrettifyJson = () => {
        const view = viewRef.current;
        if (!view) return;
        try {
          const text = view.state.doc.toString();
          const obj = JSON.parse(text);
          const isPrettified = text.includes('\n');
          const newText = isPrettified ? JSON.stringify(obj) : JSON.stringify(obj, null, settings.jsonIndentSize || 2);
          view.dispatch({ changes: { from: 0, to: text.length, insert: newText } });
        } catch (e) {
          // invalid json
        }
      };

      el.sortJsonKeys = () => {
        const view = viewRef.current;
        if (!view) return;
        try {
          const text = view.state.doc.toString();
          const obj = JSON.parse(text);
          
          const sortKeys = (o: any): any => {
            if (Array.isArray(o)) return o.map(sortKeys);
            if (o !== null && typeof o === 'object') {
              const sorted: Record<string, any> = {};
              Object.keys(o).sort().forEach(k => {
                sorted[k] = sortKeys(o[k]);
              });
              return sorted;
            }
            return o;
          };
          
          const sorted = sortKeys(obj);
          const isPrettified = text.includes('\n');
          const newText = isPrettified ? JSON.stringify(sorted, null, settings.jsonIndentSize || 2) : JSON.stringify(sorted);
          view.dispatch({ changes: { from: 0, to: text.length, insert: newText } });
        } catch (e) {}
      };

      el.generateJsonSchema = () => {
        const view = viewRef.current;
        if (!view) return;
        try {
          const text = view.state.doc.toString();
          const obj = JSON.parse(text);
          
          const generateSchema = (o: any): any => {
            if (Array.isArray(o)) {
              return { type: 'array', items: o.length > 0 ? generateSchema(o[0]) : {} };
            }
            if (o !== null && typeof o === 'object') {
              const props: Record<string, any> = {};
              for (const key in o) {
                props[key] = generateSchema(o[key]);
              }
              return { type: 'object', properties: props };
            }
            return { type: typeof o };
          };
          
          const schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            ...generateSchema(obj)
          };
          
          const newText = JSON.stringify(schema, null, settings.jsonIndentSize || 2);
          view.dispatch({ changes: { from: 0, to: text.length, insert: newText } });
        } catch (e) {}
      };

      el.insertText = (textToInsert: string) => {
        const view = viewRef.current;
        if (!view) return;
        const { state } = view;
        const { from, to } = state.selection.main;
        view.dispatch({
          changes: { from, to, insert: textToInsert },
          selection: { anchor: from + textToInsert.length },
        });
        view.focus();
      };

      el.indentList = () => {
        const view = viewRef.current;
        if (!view) return;

        const { state } = view;
        const { selection } = state;
        const changes: { from: number; to: number; insert: string }[] = [];
        let newCursorPos = selection.main.head;

        for (const range of selection.ranges) {
          const fromLine = state.doc.lineAt(range.from);
          const toLine = state.doc.lineAt(range.to);

          for (let i = fromLine.number; i <= toLine.number; i++) {
            const line = state.doc.line(i);
            const newText = indentListLine(line.text);
            changes.push({ from: line.from, to: line.to, insert: newText });
            if (range === selection.main && i === fromLine.number) {
              newCursorPos = line.from + newText.length;
            }
          }
        }

        if (changes.length > 0) {
          view.dispatch({
            changes,
            selection: EditorSelection.cursor(newCursorPos),
          });
        }
      };

      el.unindentList = () => {
        const view = viewRef.current;
        if (!view) return;

        const { state } = view;
        const { selection } = state;
        const changes: { from: number; to: number; insert: string }[] = [];
        let newCursorPos = selection.main.head;

        for (const range of selection.ranges) {
          const fromLine = state.doc.lineAt(range.from);
          const toLine = state.doc.lineAt(range.to);

          for (let i = fromLine.number; i <= toLine.number; i++) {
            const line = state.doc.line(i);
            const newText = unindentListLine(line.text);
            changes.push({ from: line.from, to: line.to, insert: newText });
            if (range === selection.main && i === fromLine.number) {
              newCursorPos = line.from + newText.length;
            }
          }
        }

        if (changes.length > 0) {
          view.dispatch({
            changes,
            selection: EditorSelection.cursor(newCursorPos),
          });
        }
      };

      el.openFindPanel = () => {
        const view = viewRef.current;
        if (!view) return;
        openSearchPanel(view);
      };

      el.openFindPanelWithQuery = (query: string, useRegEx: boolean, matchCase: boolean) => {
        const view = viewRef.current;
        if (!view) return;
        
        openSearchPanel(view);
        const currentQuery = getSearchQuery(view.state);
        view.dispatch({
          effects: setSearchQuery.of(
            new SearchQuery({
              search: query,
              caseSensitive: matchCase,
              regexp: useRegEx,
              replace: currentQuery ? currentQuery.replace : ''
            })
          )
        });
      };

      el.closeFindPanel = () => {
        const view = viewRef.current;
        if (!view) return;
        closeSearchPanel(view);
      };

      el.findNext = () => {
        const view = viewRef.current;
        if (!view) return;
        findNext(view);
      };

      el.findPrevious = () => {
        const view = viewRef.current;
        if (!view) return;
        findPrevious(view);
      };

      el.openReplacePanel = () => {
        const view = viewRef.current;
        if (!view) return;
        openSearchPanel(view);
      };

      el.insertTime = () => {
        const view = viewRef.current;
        if (!view) return;
        const time = new Date().toLocaleTimeString();
        view.dispatch(view.state.replaceSelection(time));
      };

      el.insertDate = () => {
        const view = viewRef.current;
        if (!view) return;
        const date = new Date().toLocaleDateString();
        view.dispatch(view.state.replaceSelection(date));
      };

      el.insertTimestamp = () => {
        const view = viewRef.current;
        if (!view) return;
        const ts = Date.now().toString();
        view.dispatch(view.state.replaceSelection(ts));
      };

      el.copyAsHtml = async () => {
        const view = viewRef.current;
        if (!view) return;
        const { state } = view;
        const selection = state.selection.main;
        if (selection.empty) return;
        const text = state.doc.sliceString(selection.from, selection.to);
        const html = await marked.parse(text);
        try {
          const blobText = new Blob([text], { type: 'text/plain' });
          const blobHtml = new Blob([html], { type: 'text/html' });
          const item = new ClipboardItem({
            'text/plain': blobText,
            'text/html': blobHtml
          });
          await navigator.clipboard.write([item]);
        } catch (err) {
          console.error("Failed to copy HTML", err);
        }
      };

      el.pasteFromHtml = async () => {
        const view = viewRef.current;
        if (!view) return;
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            if (item.types.includes('text/html')) {
              const blob = await item.getType('text/html');
              const html = await blob.text();
              const turndownService = new TurndownService();
              const markdown = turndownService.turndown(html);
              view.dispatch(view.state.replaceSelection(markdown));
              return;
            }
          }
          const text = await navigator.clipboard.readText();
          view.dispatch(view.state.replaceSelection(text));
        } catch (err) {
          console.error("Failed to paste HTML", err);
        }
      };

      el.duplicateLine = () => {
        const view = viewRef.current;
        if (!view) return;
        copyLineDown(view);
      };

      el.moveLineUp = () => {
        const view = viewRef.current;
        if (!view) return;
        moveLineUp(view);
      };

      el.moveLineDown = () => {
        const view = viewRef.current;
        if (!view) return;
        moveLineDown(view);
      };

      el.deleteLine = () => {
        const view = viewRef.current;
        if (!view) return;
        deleteCurrentLine(view);
      };

      el.insertLineAbove = () => {
        const view = viewRef.current;
        if (!view) return;
        insertLineAbove(view);
      };

      el.insertLineBelow = () => {
        const view = viewRef.current;
        if (!view) return;
        insertLineBelow(view);
      };

      el.transformCase = () => {
        const view = viewRef.current;
        if (!view) return;
        const { state } = view;
        const changes: { from: number; to: number; insert: string }[] = [];
        
        const getNextCase = (text: string) => {
           if (text === text.toUpperCase() && text !== text.toLowerCase()) {
             return text.toLowerCase();
           } else if (text === text.toLowerCase() && text !== text.toUpperCase()) {
             return text.replace(/\b\w/g, (c) => c.toUpperCase());
           } else {
             return text.toUpperCase();
           }
        };

        for (const range of state.selection.ranges) {
          if (!range.empty) {
             const text = state.doc.sliceString(range.from, range.to);
             changes.push({ from: range.from, to: range.to, insert: getNextCase(text) });
          } else {
             const word = state.wordAt(range.head);
             if (word) {
               const text = state.doc.sliceString(word.from, word.to);
               changes.push({ from: word.from, to: word.to, insert: getNextCase(text) });
             }
          }
        }
        
        if (changes.length > 0) {
          view.dispatch({ changes });
        }
      };

      el.scrollToLine = (lineNum: number, column?: number) => {
        const view = viewRef.current;
        if (!view) return;
        const { state } = view;
        if (lineNum > 0 && lineNum <= state.doc.lines) {
          const line = state.doc.line(lineNum);
          const colOffset = column && column > 0 ? Math.min(column - 1, line.length) : 0;
          const targetPos = line.from + colOffset;
          view.dispatch({
            selection: { anchor: targetPos, head: targetPos },
            effects: EditorView.scrollIntoView(targetPos, { y: 'start', yMargin: 40 })
          });
          view.focus();
        }
      };

      el.insertTable = () => {
        const view = viewRef.current;
        if (!view) return;
        const table = `\n| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Text     | Text     | Text     |\n| Text     | Text     | Text     |\n`;
        view.dispatch(view.state.replaceSelection(table));
      };

      el.insertLink = () => {
        const view = viewRef.current;
        if (!view) return;
        const text = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
        const link = `[${text || 'text'}](url)`;
        view.dispatch(view.state.replaceSelection(link));
      };

      el.insertCustomLink = (name: string, url: string) => {
        const view = viewRef.current;
        if (!view) return;
        if (documentTypeRef.current === 'json') {
          view.dispatch(view.state.replaceSelection(JSON.stringify(url)));
          return;
        }

        // Always replace selection with the new link
        const link = `[${name}](${url})`;
        view.dispatch(view.state.replaceSelection(link));
      };

      el.insertImage = async () => {
        const view = viewRef.current;
        if (!view) return;
        try {
          const { open } = await import('@tauri-apps/plugin-dialog');
          const selected = await open({
            multiple: false,
            filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
          });
          if (selected && typeof selected === 'string') {
            const fileName = selected.split(/[/\\]/).pop() || 'image';
            // Use local:// protocol for Tauri to load local images if needed, but standard file path works for md
            const imageStr = `![${fileName}](file:///${selected.replace(/\\/g, '/')})`;
            view.dispatch(view.state.replaceSelection(imageStr));
          } else {
            view.dispatch(view.state.replaceSelection(`![alt](url)`));
          }
        } catch {
          view.dispatch(view.state.replaceSelection(`![alt](url)`));
        }
      };

      el.toggleTask = () => {
        const view = viewRef.current;
        if (!view) return;
        const { state } = view;
        const changes: { from: number; to: number; insert: string }[] = [];
        for (const range of state.selection.ranges) {
          const line = state.doc.lineAt(range.head);
          const text = line.text;
          let newText = text;
          if (text.match(/^\s*-\s+\[ \]\s+/)) {
            newText = text.replace(/^(\s*-\s+)\[ \]/, '$1[x]');
          } else if (text.match(/^\s*-\s+\[x\]\s+/i)) {
            newText = text.replace(/^(\s*-\s+)\[x\]/i, '$1[ ]');
          } else if (text.match(/^\s*-\s+/)) {
            newText = text.replace(/^(\s*-\s+)/, '$1[ ] ');
          } else {
            newText = `- [ ] ${text}`;
          }
          changes.push({ from: line.from, to: line.to, insert: newText });
        }
        if (changes.length > 0) {
          view.dispatch({ changes });
        }
      };

      el.generateTOC = async () => {
        const view = viewRef.current;
        if (!view) return;
        const { state } = view;
        const docText = state.doc.toString();
        const lines = docText.split('\\n');
        
        let toc = '<!-- TOC START -->\\n## Table of Contents\\n\\n';
        let inCodeBlock = false;
        
        for (const line of lines) {
          if (line.trim().startsWith('\`\`\`')) {
            inCodeBlock = !inCodeBlock;
            continue;
          }
          if (!inCodeBlock) {
            const match = line.match(/^(#{1,6})\s+(.*)$/);
            if (match) {
              const level = match[1].length;
              const text = match[2].trim();
              const indent = '  '.repeat(level - 1);
              const link = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              if (text.toLowerCase() !== 'table of contents') {
                toc += `${indent}- [${text}](#${link})\\n`;
              }
            }
          }
        }
        toc += '<!-- TOC END -->\\n';

        const startIndex = docText.indexOf('<!-- TOC START -->');
        const endIndex = docText.indexOf('<!-- TOC END -->');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          // Replace existing TOC
          view.dispatch({
            changes: {
              from: startIndex,
              to: endIndex + '<!-- TOC END -->'.length,
              insert: toc.trim()
            }
          });
        } else {
          try {
            const { confirm } = await import('@tauri-apps/plugin-dialog');
            const shouldInsert = await confirm('No existing TOC found. Insert at cursor?', { title: 'Insert Table of Contents' });
            if (shouldInsert) {
              view.dispatch(view.state.replaceSelection(toc));
            }
          } catch {
             view.dispatch(view.state.replaceSelection(toc));
          }
        }
      };

      el.formatDocument = () => {
        if (documentTypeRef.current !== 'json') return;

        const view = viewRef.current;
        if (!view) return;

        const formatted = tryFormatJson(view.state.doc.toString(), settingsRef.current.jsonIndentSize);
        if (!formatted) return;

        const { anchor, head } = view.state.selection.main;
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: formatted,
          },
          selection: {
            anchor: Math.min(anchor, formatted.length),
            head: Math.min(head, formatted.length),
          },
        });
      };
    }
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="editor-container h-full w-full overflow-auto"
        data-testid="codemirror-editor"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDrop={handleDrop}
      />
      {colorPickerTarget && (
        <ColorPickerModal
          initialColor={colorPickerTarget.colorString}
          position={colorPickerTarget.position}
          onSave={(newColor) => {
            const view = viewRef.current;
            if (view) {
              view.dispatch({
                changes: {
                  from: colorPickerTarget.from,
                  to: colorPickerTarget.to,
                  insert: newColor,
                },
                selection: { anchor: colorPickerTarget.from + newColor.length },
              });
              view.focus();
            }
            setColorPickerTarget(null);
          }}
          onDiscard={() => setColorPickerTarget(null)}
        />
      )}
      {iconPickerTarget && (
        <IconPickerModal
          initialIcon={iconPickerTarget.iconName}
          packageKey={iconPickerTarget.packageKey}
          position={iconPickerTarget.position}
          onSave={(newIcon) => {
            const view = viewRef.current;
            if (view) {
              view.dispatch({
                changes: {
                  from: iconPickerTarget.from,
                  to: iconPickerTarget.to,
                  insert: newIcon,
                },
                selection: { anchor: iconPickerTarget.from + newIcon.length },
              });
              view.focus();
            }
            setIconPickerTarget(null);
          }}
          onDiscard={() => setIconPickerTarget(null)}
        />
      )}
    </>
  );
});

export default Editor;