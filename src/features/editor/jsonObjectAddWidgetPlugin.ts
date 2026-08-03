import { ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

export const jsonObjectAddWidgetPlugin = ViewPlugin.fromClass(class {
  button: HTMLElement;
  targetNode: SyntaxNode | null = null;
  view: EditorView;
  destroyed = false;

  constructor(view: EditorView) {
    this.view = view;
    this.button = document.createElement("div");
    this.button.className = "cm-add-object-btn flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded shadow-md transition-colors cursor-pointer";
    this.button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    
    // Append to scrollDOM so it scrolls natively with the content
    this.button.style.position = "absolute";
    this.button.style.right = "16px";
    this.button.style.width = "24px";
    this.button.style.height = "24px";
    this.button.style.display = "none";
    this.button.style.zIndex = "10";
    this.button.title = "Duplicate Object";

    view.scrollDOM.appendChild(this.button);

    this.button.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.duplicateObject(this.view);
    });

    // Initial measure after the editor is fully mounted
    setTimeout(() => {
      if (!this.destroyed) {
        this.measure(this.view);
      }
    }, 50);
  }

  duplicateObject(view: EditorView) {
    if (!this.targetNode) return;
    const targetNode = this.targetNode;
    const state = view.state;
    const doc = state.doc;
    
    // Get text of target
    const text = doc.sliceString(targetNode.from, targetNode.to);
    
    // Find indentation of the first line of the target
    const firstLine = doc.lineAt(targetNode.from);
    const indentMatch = firstLine.text.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0] : "";
    
    // Insert text
    const insertText = ",\n" + indent + text;
    
    // Find the first value node in the target node
    let valueOffset = -1;
    let objectNode = targetNode.name === "Object" ? targetNode : targetNode.getChild("Object");
    
    if (objectNode) {
      let firstProp = objectNode.getChild("Property");
      if (firstProp) {
        let child = firstProp.firstChild;
        while (child) {
          if (child.name !== "PropertyName" && child.name !== "⚠" && child.name !== ":") {
            valueOffset = child.from - targetNode.from;
            break;
          }
          child = child.nextSibling;
        }
      }
    }
    
    const insertPos = targetNode.to;
    
    // Transaction
    const tr = state.update({
      changes: { from: insertPos, insert: insertText }
    });
    
    view.dispatch(tr);
    
    // Set selection after dispatch
    if (valueOffset !== -1) {
      const newTargetStart = insertPos + 2 + indent.length;
      const newValuePos = newTargetStart + valueOffset;
      view.dispatch({
        selection: { anchor: newValuePos, head: newValuePos },
        scrollIntoView: true
      });
    } else {
      view.dispatch({
        selection: { anchor: insertPos + insertText.length },
        scrollIntoView: true
      });
    }
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged) {
      this.measure(update.view);
    }
  }

  measure(view: EditorView) {
    view.requestMeasure({
      read: (view) => {
        const selection = view.state.selection.main;
        if (!selection.empty) return null;
        
        const pos = selection.head;
        const tree = syntaxTree(view.state);
        let node: SyntaxNode | null = tree.resolveInner(pos, -1);
        
        if (node && node.name !== "Object") {
          const rightNode = tree.resolveInner(pos, 1);
          if (rightNode && rightNode.name === "Object") {
            node = rightNode;
          }
        }
        
        while (node && node.name !== "Object") {
          node = node.parent;
        }
        
        if (!node) return null;
        
        let targetNode: SyntaxNode = node;
        const parent = node.parent;
        if (parent && parent.name === "Property") {
          targetNode = parent;
        }
        
        const lineBlock = view.lineBlockAt(pos);
        return {
          top: lineBlock.top + Math.max(0, (lineBlock.height - 24) / 2),
          targetNode
        };
      },
      write: (measure) => {
        if (!measure) {
          this.hide();
        } else {
          this.targetNode = measure.targetNode;
          this.button.style.display = "flex";
          this.button.style.top = `${measure.top}px`;
        }
      }
    });
  }

  hide() {
    this.button.style.display = "none";
    this.targetNode = null;
  }

  destroy() {
    this.destroyed = true;
    this.button.remove();
  }
});
