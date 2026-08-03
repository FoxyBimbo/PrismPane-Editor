import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { IconPackageKey } from '../../types';
import { createIconElement, isIconName, ICON_PACKAGES } from './iconPackages';

export type OnIconPickerClick = (
  targetEl: HTMLElement,
  from: number,
  to: number,
  iconName: string,
  packageKey: Exclude<IconPackageKey, 'off'>
) => void;

export interface LineIconMatch {
  wordFrom: number;
  wordTo: number;
  widgetFrom: number;
  iconName: string;
}

const MAX_CACHE_SIZE = 5000;
const lineIconCache = new Map<string, LineIconMatch[]>();

function getLineIconMatches(lineText: string, packageKey: Exclude<IconPackageKey, 'off'>): LineIconMatch[] {
  const cacheKey = `${packageKey}:${lineText}`;
  if (lineIconCache.has(cacheKey)) {
    return lineIconCache.get(cacheKey)!;
  }

  const matches: LineIconMatch[] = [];
  // Match whole words including hyphenated icon names (e.g. house-door, map-pin, shopping-cart)
  // Ensures preceding and trailing characters are non-word chars.
  const wordRegex = /(?:^|[^a-zA-Z0-9_-])([a-zA-Z0-9_-]+)(?=[^a-zA-Z0-9_-]|$)/g;

  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(lineText)) !== null) {
    const word = match[1];
    // Compute exact starting index of word within match[0]
    const wordOffset = match[0].indexOf(word);
    const matchStart = match.index + wordOffset;
    const matchEnd = matchStart + word.length;

    if (isIconName(packageKey, word)) {
      // Determine container start if enclosed by quotes, parens, brackets, or braces
      let widgetFrom = matchStart;
      if (matchStart > 0) {
        const prevChar = lineText[matchStart - 1];
        const nextChar = lineText[matchEnd];
        const isEnclosed =
          (prevChar === '"' && nextChar === '"') ||
          (prevChar === "'" && nextChar === "'") ||
          (prevChar === '(' && nextChar === ')') ||
          (prevChar === '[' && nextChar === ']') ||
          (prevChar === '{' && nextChar === '}');

        if (isEnclosed) {
          widgetFrom = matchStart - 1;
        }
      }

      matches.push({
        wordFrom: matchStart,
        wordTo: matchEnd,
        widgetFrom,
        iconName: word,
      });
    }
  }

  if (lineIconCache.size >= MAX_CACHE_SIZE) {
    const firstKey = lineIconCache.keys().next().value;
    if (firstKey !== undefined) {
      lineIconCache.delete(firstKey);
    }
  }

  lineIconCache.set(cacheKey, matches);
  return matches;
}

class IconWidget extends WidgetType {
  readonly from: number;
  readonly to: number;
  readonly iconName: string;
  readonly packageKey: Exclude<IconPackageKey, 'off'>;
  readonly onClick: OnIconPickerClick;

  constructor(
    from: number,
    to: number,
    iconName: string,
    packageKey: Exclude<IconPackageKey, 'off'>,
    onClick: OnIconPickerClick
  ) {
    super();
    this.from = from;
    this.to = to;
    this.iconName = iconName;
    this.packageKey = packageKey;
    this.onClick = onClick;
  }

  eq(other: IconWidget): boolean {
    return (
      other.from === this.from &&
      other.to === this.to &&
      other.iconName === this.iconName &&
      other.packageKey === this.packageKey
    );
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-icon-helper-wrapper inline-flex items-center align-middle select-none cursor-pointer opacity-85 hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 rounded px-1 py-0.5 mx-0.5 text-xs';
    wrapper.title = `Click to change icon (${ICON_PACKAGES[this.packageKey]?.name}): ${this.iconName}`;

    const iconEl = createIconElement(this.packageKey, this.iconName);
    wrapper.appendChild(iconEl);

    wrapper.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick(wrapper, this.from, this.to, this.iconName, this.packageKey);
    });

    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildDecorations(view: EditorView, packageKey: Exclude<IconPackageKey, 'off'>, onClick: OnIconPickerClick) {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos < to) {
      const line = view.state.doc.lineAt(pos);
      const matches = getLineIconMatches(line.text, packageKey);

      for (const match of matches) {
        const absWidgetFrom = line.from + match.widgetFrom;
        const absWordFrom = line.from + match.wordFrom;
        const absWordTo = line.from + match.wordTo;

        if (absWidgetFrom >= from && absWidgetFrom <= to) {
          const widget = Decoration.widget({
            widget: new IconWidget(absWordFrom, absWordTo, match.iconName, packageKey, onClick),
            side: -1,
          });
          builder.add(absWidgetFrom, absWidgetFrom, widget);
        }
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

/**
 * Creates the CodeMirror ViewPlugin for inline icon decorations.
 */
export function createIconHelperPlugin(
  packageKey: Exclude<IconPackageKey, 'off'>,
  onOpenPicker: OnIconPickerClick
) {
  return ViewPlugin.fromClass(
    class {
      decorations;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, packageKey, onOpenPicker);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, packageKey, onOpenPicker);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  );
}
