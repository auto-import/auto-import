import { describe, expect, it } from "vitest";
import { UI_TEXT_RENDERING_FIXTURE } from "./ui-text-fixture";

describe("UTF-8 UI rendering fixture", () => {
  it("preserves French and Latin Extended text without corruption markers", () => {
    expect(UI_TEXT_RENDERING_FIXTURE).toEqual([
      "Création d'un dossier d'importation",
      "Véhicules",
      "Équipe",
      "Récapitulatif",
      "Expédition seule",
      "Responsable Algérie",
      "Coût total",
      "Contrat signé",
    ]);
    expect(UI_TEXT_RENDERING_FIXTURE.join(" ")).not.toMatch(
      /Ã|Â|â€™|â€“|â€”|â€¦|â†’|ï¿½|�/u,
    );
  });
});
