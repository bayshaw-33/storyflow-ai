"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  translate,
  type DictionaryKey,
  type Locale,
} from "@/lib/i18n/dictionaries";

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      setLocaleState(normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)));
    } catch {
      setLocaleState(DEFAULT_LOCALE);
    }
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    } catch {
      // Some embedded browsers block localStorage; keep the in-memory UI state.
    }
    window.dispatchEvent(new CustomEvent("kiiskiis:locale-change", { detail: nextLocale }));
  }, []);

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const nextLocale = (event as CustomEvent<Locale>).detail;
      setLocaleState(normalizeLocale(nextLocale));
    }

    window.addEventListener("kiiskiis:locale-change", handleLocaleChange);
    return () => window.removeEventListener("kiiskiis:locale-change", handleLocaleChange);
  }, []);

  const t = useCallback((key: DictionaryKey) => translate(locale, key), [locale]);

  return {
    locale,
    setLocale,
    t,
  };
}
