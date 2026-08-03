import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { Validator } from 'jsonschema';
import type { Schema } from 'jsonschema';
import { minimatch } from 'minimatch';

const REMOTE_CATALOG_URL = 'https://www.schemastore.org/api/json/catalog.json';
const CACHE_DIR_NAME = 'prismpane';
const CACHE_FILE_NAME = 'schema-catalog-cache.json';

interface SchemaCatalogEntry {
  name?: string;
  description?: string;
  fileMatch?: string[];
  url: string;
}

interface SchemaCatalog {
  $schema?: string;
  version?: number;
  schemas: SchemaCatalogEntry[];
}

interface SchemaCatalogCache {
  source: 'remote' | 'fallback' | 'cache';
  remoteCatalogUrl: string;
  lastSyncedAt: string;
  catalog: SchemaCatalog;
  schemas: Record<string, unknown>;
}

let inMemoryCache: SchemaCatalogCache | null = null;
let syncPromise: Promise<SchemaCatalogCache> | null = null;

function tryParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function ensureCatalog(input: unknown): SchemaCatalog | null {
  if (!input || typeof input !== 'object') return null;
  const maybe = input as { schemas?: unknown };
  if (!Array.isArray(maybe.schemas)) return null;
  const schemas = maybe.schemas.filter((entry): entry is SchemaCatalogEntry => {
    if (!entry || typeof entry !== 'object') return false;
    return typeof (entry as SchemaCatalogEntry).url === 'string';
  });
  return {
    ...(input as object),
    schemas,
  } as SchemaCatalog;
}

async function cacheFilePath(): Promise<string> {
  const root = await appDataDir();
  const dir = await join(root, CACHE_DIR_NAME);
  await mkdir(dir, { recursive: true });
  return join(dir, CACHE_FILE_NAME);
}

async function readDiskCache(): Promise<SchemaCatalogCache | null> {
  const filePath = await cacheFilePath();
  if (!(await exists(filePath))) return null;

  const raw = await readTextFile(filePath);
  const parsed = tryParseJson<SchemaCatalogCache>(raw);
  if (!parsed) return null;

  const catalog = ensureCatalog(parsed.catalog);
  if (!catalog) return null;

  return {
    ...parsed,
    catalog,
    schemas: parsed.schemas && typeof parsed.schemas === 'object' ? parsed.schemas : {},
    remoteCatalogUrl: parsed.remoteCatalogUrl || REMOTE_CATALOG_URL,
    source: parsed.source || 'cache',
    lastSyncedAt: parsed.lastSyncedAt || new Date(0).toISOString(),
  };
}

async function writeDiskCache(cache: SchemaCatalogCache): Promise<void> {
  const filePath = await cacheFilePath();
  await writeTextFile(filePath, JSON.stringify(cache));
}

async function fetchJson(url: string, timeoutMs = 9000): Promise<unknown | null> {
  try {
    const raw = await invoke<string | null>('fetch_json_url', { url, timeoutMs });
    if (!raw) return null;
    return tryParseJson<unknown>(raw);
  } catch {
    return null;
  }
}

function selectMatchingSchemas(catalog: SchemaCatalog, fileIdentity: string): SchemaCatalogEntry[] {
  const normalized = fileIdentity.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() || normalized;

  return catalog.schemas.filter((entry) => {
    const patterns = entry.fileMatch ?? [];
    if (!patterns.length) return false;

    return patterns.some((pattern) => {
      const options = {
        dot: true,
        nocase: true,
        matchBase: !pattern.includes('/'),
      };
      return minimatch(normalized, pattern, options) || minimatch(basename, pattern, options);
    });
  });
}

async function fetchAndCacheSchema(url: string, cache: SchemaCatalogCache): Promise<void> {
  const schema = await fetchJson(url, 9000);
  if (!schema || typeof schema !== 'object') return;
  cache.schemas[url] = schema;
}

async function fetchAllSchemas(catalog: SchemaCatalog, cache: SchemaCatalogCache): Promise<void> {
  const urls = Array.from(new Set(catalog.schemas.map((entry) => entry.url).filter(Boolean)));
  const BATCH_SIZE = 8;

  for (let index = 0; index < urls.length; index += BATCH_SIZE) {
    const batch = urls.slice(index, index + BATCH_SIZE);
    await Promise.all(batch.map((url) => fetchAndCacheSchema(url, cache)));
  }
}

function catalogsDiffer(a: SchemaCatalog, b: SchemaCatalog): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

async function getFallbackCatalog(): Promise<SchemaCatalog> {
  const fallbackRaw = await invoke<string>('get_fallback_schema_catalog');
  const parsed = tryParseJson<unknown>(fallbackRaw);
  const catalog = ensureCatalog(parsed);
  if (!catalog) {
    return { schemas: [] };
  }
  return catalog;
}

async function syncInternal(): Promise<SchemaCatalogCache> {
  const fallbackCatalog = await getFallbackCatalog();
  const disk = await readDiskCache();

  const cache: SchemaCatalogCache = disk ?? {
    source: 'fallback',
    remoteCatalogUrl: REMOTE_CATALOG_URL,
    lastSyncedAt: new Date(0).toISOString(),
    catalog: fallbackCatalog,
    schemas: {},
  };

  if (!disk) {
    cache.catalog = fallbackCatalog;
    cache.source = 'fallback';
  }

  const remote = ensureCatalog(await fetchJson(REMOTE_CATALOG_URL));
  if (remote) {
    if (catalogsDiffer(cache.catalog, remote)) {
      cache.catalog = remote;
    }
    cache.source = 'remote';
  } else if (!cache.catalog.schemas.length) {
    cache.catalog = fallbackCatalog;
    cache.source = 'fallback';
  }

  await fetchAllSchemas(cache.catalog, cache);
  cache.lastSyncedAt = new Date().toISOString();
  cache.remoteCatalogUrl = REMOTE_CATALOG_URL;

  await writeDiskCache(cache);
  inMemoryCache = cache;
  return cache;
}

export async function initializeSchemaCatalogSync(): Promise<void> {
  if (!syncPromise) {
    syncPromise = syncInternal().finally(() => {
      syncPromise = null;
    });
  }
  await syncPromise;
}

async function getCache(): Promise<SchemaCatalogCache> {
  if (inMemoryCache) return inMemoryCache;

  const disk = await readDiskCache();
  if (disk) {
    inMemoryCache = disk;
    return disk;
  }

  await initializeSchemaCatalogSync();
  if (inMemoryCache) return inMemoryCache;

  const fallbackCatalog = await getFallbackCatalog();
  return {
    source: 'fallback',
    remoteCatalogUrl: REMOTE_CATALOG_URL,
    lastSyncedAt: new Date().toISOString(),
    catalog: fallbackCatalog,
    schemas: {},
  };
}

export async function validateJsonAgainstCatalog(fileIdentity: string, content: string): Promise<string[]> {
  const cache = await getCache();
  const matches = selectMatchingSchemas(cache.catalog, fileIdentity);
  if (!matches.length) return [];

  const documentValue = tryParseJson<unknown>(content);
  if (!documentValue) {
    return ['Document is not valid JSON.'];
  }

  const validator = new Validator();
  for (const [url, schema] of Object.entries(cache.schemas)) {
    if (schema && typeof schema === 'object') {
      validator.addSchema(schema as Schema, url);
    }
  }

  const messages: string[] = [];
  for (const schemaEntry of matches) {
    let schema = cache.schemas[schemaEntry.url];

    if (!schema) {
      await fetchAndCacheSchema(schemaEntry.url, cache);
      schema = cache.schemas[schemaEntry.url];
    }

    if (!schema) {
      messages.push(`Could not load schema ${schemaEntry.url}`);
      continue;
    }

    const result = validator.validate(documentValue, schema, { nestedErrors: true });
    for (const error of result.errors) {
      messages.push(`${schemaEntry.name ?? schemaEntry.url}: ${error.property} ${error.message}`.trim());
    }
  }

  if (messages.length > 0) {
    await writeDiskCache(cache);
  }

  return messages;
}
