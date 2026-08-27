import { describe, expect, it } from "vitest";
import {
  translateCatalogKey,
  translationCatalogKeys,
} from "./I18nProvider";
import {
  legacyCatalogCounts,
  translateInterfaceText,
} from "@/lib/i18n/interface-text";

describe("FR/EN localization catalogs", () => {
  it("keeps identical typed key sets", () => {
    expect(translationCatalogKeys("fr")).toEqual(translationCatalogKeys("en"));
  });

  it("resolves every typed key without exposing raw keys", () => {
    for (const locale of ["fr", "en"] as const) {
      for (const key of translationCatalogKeys(locale)) {
        expect(translateCatalogKey(locale, key as never)).not.toBe(key);
      }
    }
  });

  it("keeps legacy route-catalog parity and translates representative copy", () => {
    expect(legacyCatalogCounts.fr).toBe(legacyCatalogCounts.en);
    expect(translateInterfaceText("Aucun client trouvé.", "en")).toBe(
      "No clients found.",
    );
    expect(translateInterfaceText("Dashboard", "fr")).toBe("Tableau de bord");
  });
});
