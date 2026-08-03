// ============================================================
// PrismPane — IndexedDB Persistence via idb-keyval
// ============================================================

import { get, set, del, keys, createStore, type UseStore } from 'idb-keyval';

/** Dedicated idb-keyval store for PrismPane data */
export const prismStore: UseStore = createStore('prismpane-db', 'prismpane-store');

// ─── Settings Persistence ──────────────────────────────────

const SETTINGS_KEY = 'app-settings';

export async function loadSettings<T>(): Promise<T | null> {
  try {
    return (await get<T>(SETTINGS_KEY, prismStore)) ?? null;
  } catch {
    return null;
  }
}

export async function saveSettings<T>(value: T): Promise<void> {
  await set(SETTINGS_KEY, value, prismStore);
}

// ─── Open Tabs Persistence ─────────────────────────────────

const TAB_INDEX_KEY = 'tab-index';   // ordered array of tab IDs
const TAB_PREFIX = 'tab:';           // prefix for individual tab data
const ACTIVE_TAB_KEY = 'active-tab'; // remembered active tab ID
const FOLDER_KEY = 'open-folder';    // remembered open folder path
const SIDEBAR_TAB_KEY = 'sidebar-tab';
const EXPANDED_FOLDERS_KEY = 'expanded-folders';

/** Save the currently open folder path for session restore */
export async function saveOpenFolder(folderPath: string | null): Promise<void> {
  if (folderPath) {
    await set(FOLDER_KEY, folderPath, prismStore);
  } else {
    await del(FOLDER_KEY, prismStore);
  }
}

/** Load the previously open folder path */
export async function loadOpenFolder(): Promise<string | null> {
  try {
    return (await get<string>(FOLDER_KEY, prismStore)) ?? null;
  } catch {
    return null;
  }
}

export async function saveSidebarTab(tab: string): Promise<void> {
  await set(SIDEBAR_TAB_KEY, tab, prismStore);
}

export async function loadSidebarTab(): Promise<string | null> {
  try {
    return (await get<string>(SIDEBAR_TAB_KEY, prismStore)) ?? null;
  } catch {
    return null;
  }
}

export async function saveExpandedFolders(folders: string[]): Promise<void> {
  await set(EXPANDED_FOLDERS_KEY, folders, prismStore);
}

export async function loadExpandedFolders(): Promise<string[]> {
  try {
    return (await get<string[]>(EXPANDED_FOLDERS_KEY, prismStore)) ?? [];
  } catch {
    return [];
  }
}

export interface PersistedTab {
  id: string;
  name: string;
  content: string;
  isDirty: boolean;
  hasEverBeenSaved: boolean;
  savedContent: string;
  /** Real filesystem path, empty string if never saved to disk */
  filePath: string;
  cursorPos?: number;
}

/** Load the ordered list of open tab IDs */
export async function loadTabOrder(): Promise<string[]> {
  try {
    return (await get<string[]>(TAB_INDEX_KEY, prismStore)) ?? [];
  } catch {
    return [];
  }
}

/** Save the ordered list of open tab IDs */
export async function saveTabOrder(order: string[]): Promise<void> {
  await set(TAB_INDEX_KEY, order, prismStore);
}

/** Load the active tab ID */
export async function loadActiveTabId(): Promise<string | null> {
  try {
    return (await get<string>(ACTIVE_TAB_KEY, prismStore)) ?? null;
  } catch {
    return null;
  }
}

/** Save the active tab ID */
export async function saveActiveTabId(id: string | null): Promise<void> {
  if (id) {
    await set(ACTIVE_TAB_KEY, id, prismStore);
  } else {
    await del(ACTIVE_TAB_KEY, prismStore);
  }
}

/** Load a single tab by its ID */
export async function loadTab(id: string): Promise<PersistedTab | null> {
  try {
    return (await get<PersistedTab>(`${TAB_PREFIX}${id}`, prismStore)) ?? null;
  } catch {
    return null;
  }
}

/** Save (upsert) a single tab */
export async function saveTab(tab: PersistedTab): Promise<void> {
  await set(`${TAB_PREFIX}${tab.id}`, tab, prismStore);
}

/** Delete a single tab from storage */
export async function deleteTab(id: string): Promise<void> {
  await del(`${TAB_PREFIX}${id}`, prismStore);
}

/** Load all tabs (order + individual data) */
export async function loadAllTabs(): Promise<PersistedTab[]> {
  const order = await loadTabOrder();
  const tabs: PersistedTab[] = [];
  // Rebuild tabs in saved order so the UI matches the last session.
  for (const id of order) {
    const tab = await loadTab(id);
    if (tab) tabs.push(tab);
  }
  return tabs;
}

/** Persist the full tab state: order + each tab */
export async function saveAllTabs(
  order: string[],
  tabs: PersistedTab[],
  activeTabId: string | null,
): Promise<void> {
  await saveTabOrder(order);
  await saveActiveTabId(activeTabId);
  // Store each tab separately so the restore step can recover partial data too.
  await Promise.all(tabs.map((t) => saveTab(t)));
}

/** Remove a tab from storage completely */
export async function removeTab(id: string): Promise<void> {
  await deleteTab(id);
  const order = await loadTabOrder();
  await saveTabOrder(order.filter((o) => o !== id));
}

// ─── Recent Files & Folders ──────────────────────────────

const RECENT_FILES_KEY = 'recent-files';
const RECENT_FOLDERS_KEY = 'recent-folders';
const MAX_RECENT = 10;

export async function getRecentFiles(): Promise<string[]> {
  try {
    return (await get<string[]>(RECENT_FILES_KEY, prismStore)) ?? [];
  } catch {
    return [];
  }
}

export async function addRecentFile(path: string): Promise<void> {
  if (!path || path.startsWith('untitled:')) return;
  const recent = await getRecentFiles();
  const next = [path, ...recent.filter((p) => p !== path)].slice(0, MAX_RECENT);
  await set(RECENT_FILES_KEY, next, prismStore);
}

export async function getRecentFolders(): Promise<string[]> {
  try {
    return (await get<string[]>(RECENT_FOLDERS_KEY, prismStore)) ?? [];
  } catch {
    return [];
  }
}

export async function addRecentFolder(path: string): Promise<void> {
  if (!path) return;
  const recent = await getRecentFolders();
  const next = [path, ...recent.filter((p) => p !== path)].slice(0, MAX_RECENT);
  await set(RECENT_FOLDERS_KEY, next, prismStore);
}