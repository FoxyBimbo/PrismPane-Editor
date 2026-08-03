# PrismPane Architecture & Context

**Project:** PrismPane 
**Type:** Desktop Markdown Editor
**Architecture:** Tauri v2 (Rust Shell) + React / TypeScript / Vite (UI)

This document serves as the core architectural overview and rulebook for AI agents working on this codebase.

---

## Core Tech Stack
- **Shell / Backend:** Tauri v2 (Rust)
- **Frontend Core:** React 19, TypeScript 6, Vite 8
- **Styling:** Tailwind CSS 4, Lucide React (Icons)
- **Editor:** CodeMirror 6 (with markdown language support)
- **Rendering:** `marked` (Markdown → HTML), `html2pdf.js` (PDF export)
- **Storage & I/O:** - `@tauri-apps/plugin-fs` for native file system operations
  - `idb-keyval` for IndexedDB state persistence

---

## Key Features
- **Editor:** Live preview (split/edit-only), Zen Mode, Typewriter Mode.
- **File Management:** Tab-based multi-file editing with drag-to-reorder. Folder browsing, renaming, and exporting via sidebar tree.
- **Reactivity:** File-system watcher auto-refreshes the tree on external changes.
- **State:** Persists open tabs and user settings in IndexedDB across restarts.
- **Interoperability:** Export to HTML/PDF; smart copy/paste between HTML and Markdown.

---

## Keyboard Shortcuts

### 1. General & Interface Navigation
* Opens the Command Palette (`Ctrl+Shift+P` or `F1`)
* Quick Open to search and instantly jump to any file (`Ctrl+P`)
* Toggles the Sidebar visibility (`Ctrl+B`)
* Opens the User Settings tab (`Ctrl+,`)
* Enters or exits Zen Mode (`Ctrl+K`)
* Increases the Font Size setting for the editor (`Ctrl++`)
* Decreases the Font Size setting for the editor (`Ctrl+-`)

### 2. File & Editor Management
* Opens a file (`Ctrl+O`)
* Opens a folder (`Ctrl+Shift+O`)
* Creates a new file (`Ctrl+N`)
* Saves the current file (`Ctrl+S`)
* Saves the current file as a new file (`Ctrl+Shift+S`)
* Closes the active editor tab (`Ctrl+W`)
* Cycles through your open tabs (`Ctrl+Tab`)
* Switches focus to the 1st, 2nd, or 3rd open tab (`Ctrl+1` / `2` / `3`)

### 3. Basic Code Editing & Formatting
* Cuts the entire line where the cursor is resting (`Ctrl+X`)
* Copies the entire current line (`Ctrl+C`)
* Moves the current line or selected block up or down (`Alt+Up/Down Arrow`)
* Duplicates the current line or selection up or down (`Shift+Alt+Up/Down Arrow`)
* Deletes the current line (`Ctrl+Shift+K`)
* Inserts a new line below without moving your cursor (`Ctrl+Enter`)
* Inserts a new line above (`Ctrl+Shift+Enter`)

### 4. Search, Replace, & Code Navigation
* Opens the local Find and Replace panel (`Ctrl+F` / `Ctrl+H`)
* Opens the Search Side Panel to perform a global search across all files with the advanced options oppen (`Ctrl+Shift+F`)
* Goes to a specific line number (`Ctrl+G`)

### 5. Markdown Specific Shortcuts
* In the Markdown Editor toggle the Preview Pane (`Ctrl+\`)
* In the Markdown Editor Toggles the current line to a matching Heading tag  (`Ctrl+Shift+1` / `2` / `3` / `4` / `5` / `6`)
* In the Markdown Editor Toggles the current line to an Unorganized List (`Ctrl+*`)
* In the Markdown Editor Toggles the selected text, or the word the cursor is in Bold (`Ctrl+B`)
* In the Markdown Editor Toggles the selected text, or the word the cursor is in Italics (`Ctrl+I`)

---

## Project Structure
| Path | Purpose & Responsibilities |
|---|---|
| `src/App.tsx` | Main application shell. Manages global state, menus, keyboard shortcuts, tab management, and high-level file I/O. |
| `src/features/editor/` | CodeMirror integration, custom extensions, and theme configurations. |
| `src/features/formatters/` | Markdown templates (Agents, README, blog posts, etc.) and export logic. |
| `src/components/` | Reusable UI components (Sidebar, TabBar, Toolbar, MenuBar, Preview, Settings, CommandPalette). |
| `src/hooks/` | Custom React hooks (e.g., `useSettings`, `useIndexedDB`). Keep business logic here. |
| `src-tauri/` | Rust backend. Handles file watching, single-instance locking, and OS-level file associations. |

---

## AI Agent Directives & Constraints
When writing or modifying code for this project, adhere strictly to the following rules:

1. **Frontend File System:** NEVER use Node.js `fs` or `path` modules in the React frontend. Always use Tauri's `@tauri-apps/plugin-fs` and `@tauri-apps/api/path`.
2. **State Management:** Prioritize custom hooks (`src/hooks/`) for complex state over stuffing logic into component files.
3. **Styling:** Use standard Tailwind CSS classes. Avoid inline styles or creating new CSS files unless absolutely necessary for complex animations.
4. **TypeScript:** Use strict typing. Avoid `any`. Define proper interfaces for all Tauri IPC payloads and CodeMirror extensions.
5. **UI Components:** Keep components modular and functional. Use Lucide React for all iconography.

---

## How to Run

**Desktop App (Tauri)**
```bash
npm install
npm run tauri dev