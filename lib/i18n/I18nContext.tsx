"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { type Locale, translations, isRTL } from "./translations";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function useI18n() {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Load saved locale on mount
  useEffect(() => {
    const saved = localStorage.getItem("strikemap-locale") as Locale | null;
    if (saved && translations[saved]) {
      setLocaleState(saved);
    }
  }, []);

  // Apply lang/dir attributes when locale changes
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL(locale) ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("strikemap-locale", l);
  }, []);

  const t = useCallback(
    (key: string): string => translations[locale]?.[key] || translations.en[key] || key,
    [locale]
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}
