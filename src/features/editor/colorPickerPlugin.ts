import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type EditorView, type ViewUpdate } from '@codemirror/view';
import { colord } from 'colord';

export interface LineColorMatch {
  relativeFrom: number;
  relativeTo: number;
  colorString: string;
}

export type OnColorSwatchClick = (
  targetEl: HTMLElement,
  from: number,
  to: number,
  colorString: string
) => void;

// Cache map storing detected color matches for each line text.
// Max capacity prevents unbounded memory growth.
const MAX_CACHE_SIZE = 5000;
const lineColorCache = new Map<string, LineColorMatch[]>();

function getLineColorMatches(lineText: string): LineColorMatch[] {
  if (lineColorCache.has(lineText)) {
    return lineColorCache.get(lineText)!;
  }

  const matches: LineColorMatch[] = [];

  // Match hex codes: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  // Prefix check ensures we don't match mid-identifier (e.g. var#fff)
  const hexRegex = /(?:^|[\s,;:({["'<=>])(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4}))\b/g;
  // Match rgb / rgba functions
  const rgbRegex = /\b(rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+%?\s*)?\))/gi;
  // Match hsl / hsla functions
  const hslRegex = /\b(hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(?:,\s*[\d.]+%?\s*)?\))/gi;

  const processRegex = (regex: RegExp, groupIndex = 1) => {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      const colorStr = match[groupIndex];
      const matchIndex = match.index + match[0].indexOf(colorStr);

      if (colord(colorStr).isValid()) {
        matches.push({
          relativeFrom: matchIndex,
          relativeTo: matchIndex + colorStr.length,
          colorString: colorStr,
        });
      }
    }
  };

  processRegex(hexRegex, 1);
  processRegex(rgbRegex, 1);
  processRegex(hslRegex, 1);

  // Sort matches by position to ensure sequential RangeSet building
  matches.sort((a, b) => a.relativeFrom - b.relativeFrom);

  // Maintain cache size ceiling
  if (lineColorCache.size >= MAX_CACHE_SIZE) {
    const firstKey = lineColorCache.keys().next().value;
    if (firstKey !== undefined) {
      lineColorCache.delete(firstKey);
    }
  }

  lineColorCache.set(lineText, matches);
  return matches;
}

class ColorSwatchWidget extends WidgetType {
  readonly from: number;
  readonly to: number;
  readonly colorString: string;
  readonly onClick: OnColorSwatchClick;

  constructor(
    from: number,
    to: number,
    colorString: string,
    onClick: OnColorSwatchClick
  ) {
    super();
    this.from = from;
    this.to = to;
    this.colorString = colorString;
    this.onClick = onClick;
  }


  eq(other: ColorSwatchWidget): boolean {
    return (
      other.from === this.from &&
      other.to === this.to &&
      other.colorString === this.colorString
    );
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-color-swatch-wrapper inline-flex items-center align-middle select-none mr-1.5 ml-0.5';
    wrapper.style.display = 'inline-flex';
    wrapper.style.verticalAlign = '-2px';

    const swatch = document.createElement('span');
    swatch.className = 'cm-color-swatch';
    swatch.title = `Click to edit color: ${this.colorString}`;
    swatch.style.backgroundColor = this.colorString;

    swatch.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick(swatch, this.from, this.to, this.colorString);
    });

    wrapper.appendChild(swatch);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildDecorations(view: EditorView, onClick: OnColorSwatchClick) {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos < to) {
      const line = view.state.doc.lineAt(pos);
      const matches = getLineColorMatches(line.text);

      for (const match of matches) {
        const absFrom = line.from + match.relativeFrom;
        const absTo = line.from + match.relativeTo;

        if (absFrom >= from && absFrom <= to) {
          const widget = Decoration.widget({
            widget: new ColorSwatchWidget(absFrom, absTo, match.colorString, onClick),
            side: -1,
          });
          builder.add(absFrom, absFrom, widget);
        }
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

/**
 * Creates the CodeMirror ViewPlugin for inline color swatches.
 */
export function createColorPickerPlugin(onOpenPicker: OnColorSwatchClick) {
  return ViewPlugin.fromClass(
    class {
      decorations;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, onOpenPicker);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged
        ) {
          this.decorations = buildDecorations(update.view, onOpenPicker);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  );
}
