import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

const localeLoaders = {
  fr: () => import("./locales/fr.json"),
  it: () => import("./locales/it.json"),
  de: () => import("./locales/de.json"),
  es: () => import("./locales/es.json"),
  "es-MX": () => import("./locales/es-MX.json"),
  "pt-BR": () => import("./locales/pt-BR.json"),
  "zh-TW": () => import("./locales/zh-TW.json"),
  "zh-CN": () => import("./locales/zh-CN.json"),
  ja: () => import("./locales/ja.json"),
  ko: () => import("./locales/ko.json"),
  th: () => import("./locales/th.json"),
  id: () => import("./locales/id.json"),
} as const;

export const SUPPORTED_LANGUAGES = [
  "en",
  "fr",
  "it",
  "de",
  "es",
  "es-MX",
  "pt-BR",
  "zh-TW",
  "zh-CN",
  "ja",
  "ko",
  "th",
  "id",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = "admindeck.language";

export function detectLanguage(): SupportedLanguage {
  return getStoredLanguage() ?? detectSystemLanguage();
}

function getStoredLanguage(): SupportedLanguage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && isSupportedLanguage(stored)) {
      return stored;
    }
  } catch {
    // Storage unavailable
  }
  return null;
}

function detectSystemLanguage(): SupportedLanguage {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const candidates = [...(navigator.languages ?? []), navigator.language];
  for (const language of candidates) {
    const supportedLanguage = matchSupportedLanguage(language);
    if (supportedLanguage) {
      return supportedLanguage;
    }
  }

  return "en";
}

function matchSupportedLanguage(language: string | undefined): SupportedLanguage | null {
  if (!language) {
    return null;
  }

  const normalized = language.trim().replace("_", "-");
  if (!normalized) {
    return null;
  }

  if (isSupportedLanguage(normalized)) {
    return normalized;
  }

  const lowerLanguage = normalized.toLowerCase();
  if (lowerLanguage.startsWith("zh")) {
    if (
      lowerLanguage.includes("hans") ||
      lowerLanguage.includes("-cn") ||
      lowerLanguage.includes("-sg")
    ) {
      return "zh-CN";
    }
    return "zh-TW";
  }

  if (lowerLanguage === "pt" || lowerLanguage.startsWith("pt-")) {
    return "pt-BR";
  }

  if (lowerLanguage === "es-mx") {
    return "es-MX";
  }

  const baseLanguage = lowerLanguage.split("-")[0];
  return (
    SUPPORTED_LANGUAGES.find(
      (supportedLanguage) => supportedLanguage.toLowerCase() === baseLanguage,
    ) ?? null
  );
}

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

export function persistLanguage(language: SupportedLanguage) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage may be unavailable
  }
}

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  returnEmptyString: false,
});

let readyLanguage: SupportedLanguage | null = null;

async function loadLocale(language: SupportedLanguage): Promise<void> {
  if (language === "en" || i18next.hasResourceBundle(language, "translation")) {
    return;
  }

  try {
    const module = await localeLoaders[language]();
    i18next.addResourceBundle(language, "translation", module.default ?? module, true, true);
  } catch {
    // Fall back to English silently
  }
}

export async function ensureI18nReady(): Promise<void> {
  const language = detectLanguage();
  if (readyLanguage === language) {
    return;
  }

  await loadLocale(language);

  if (i18next.language !== language) {
    await i18next.changeLanguage(language);
    persistLanguage(language);
  }

  readyLanguage = language;
}

export async function switchLanguage(language: SupportedLanguage): Promise<void> {
  if (language === i18next.language) {
    return;
  }

  await loadLocale(language);
  await i18next.changeLanguage(language);
  persistLanguage(language);
  readyLanguage = language;
}

export default i18next;
