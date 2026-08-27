import type { AppLocale } from "./interface-text";

let activeLocale: AppLocale = "fr";

export function setRuntimeLocale(locale: AppLocale) {
  activeLocale = locale;
}

export function getRuntimeLocale() {
  return activeLocale === "fr" ? "fr-DZ" : "en-US";
}
