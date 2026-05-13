import "server-only";
import type { Dict } from "./en";

const dictionaries: Record<string, () => Promise<Dict>> = {
  en: () => import("./en").then((m) => m.default),
  es: () => import("./es").then((m) => m.default),
};

export type Locale = keyof typeof dictionaries;

export const locales = Object.keys(dictionaries) as Locale[];
export const defaultLocale: Locale = "en";

export const hasLocale = (locale: string): locale is Locale =>
  locale in dictionaries;

export const getDictionary = (locale: Locale): Promise<Dict> =>
  dictionaries[locale]();

export type { Dict };
