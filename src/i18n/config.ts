export const locales = ["en", "da"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
