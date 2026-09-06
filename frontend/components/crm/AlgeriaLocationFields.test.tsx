// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AlgeriaLocationFields from "./AlgeriaLocationFields";

const references = [
  {
    id: "dz",
    kind: "COUNTRY" as const,
    code: "DZ",
    labelFr: "Algérie",
    active: true,
    sortOrder: 1,
  },
];

describe("AlgeriaLocationFields", () => {
  afterEach(cleanup);

  it("limits communes to the selected wilaya and resets the commune", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AlgeriaLocationFields
        references={references}
        inputClass="input"
        countryId="dz"
        wilaya="Oran"
        city="Bir El Djir"
        onChange={onChange}
      />,
    );
    const commune = screen.getByLabelText("Ville / Commune");
    expect((commune as HTMLSelectElement).disabled).toBe(false);
    expect(screen.getByRole("option", { name: "Bir El Djir" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Alger Centre" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Wilaya"), {
      target: { value: "Alger" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      countryId: "dz",
      wilaya: "Alger",
      city: "",
    });

    rerender(
      <AlgeriaLocationFields
        references={references}
        inputClass="input"
        countryId="dz"
        wilaya=""
        city=""
        onChange={onChange}
      />,
    );
    expect(
      (screen.getByLabelText("Ville / Commune") as HTMLSelectElement).disabled,
    ).toBe(true);
  });
});
