// ============================================================
// PrismPane — Settings Persistence Hook (IndexedDB-backed)
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { loadSettings, saveSettings } from './useIndexedDB';

/**
 * Manages application settings with IndexedDB persistence.
 * Falls back to defaults if DB is unavailable.
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    loadSettings<Partial<AppSettings> & { showAllFiles?: boolean }>().then((stored) => {
      if (!cancelled && stored) {
        const nextSettings: AppSettings = { ...DEFAULT_SETTINGS, ...stored };
        // Older builds had spellcheck disabled by default with no UI toggle.
        // Prefer enabling it when loading legacy settings.
        if (stored.spellCheck === undefined || stored.spellCheck === false) {
          nextSettings.spellCheck = true;
        }
        if (typeof stored.showAllFiles === 'boolean' && stored.visibleFiles === undefined) {
          nextSettings.visibleFiles = stored.showAllFiles ? 'all' : 'markdown';
        }
        setSettings(nextSettings);
      }
      setIsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Persist on every change after initial load
  useEffect(() => {
    if (isLoaded) {
      saveSettings(settings);
    }
  }, [settings, isLoaded]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  return { settings, updateSetting, resetSettings, isLoaded };
}