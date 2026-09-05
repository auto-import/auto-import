// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LeadFormDialog from "./LeadFormDialog";

vi.mock("@/lib/crm-api", () => ({
  crmApi: {
    referenceData: vi.fn().mockResolvedValue([]),
    createProspect: vi.fn(),
  },
}));

describe("LeadFormDialog", () => {
  afterEach(() => cleanup());

  it("keeps the complete form scrollable inside a viewport-bounded modal", () => {
    const { container } = render(
      <LeadFormDialog onClose={() => undefined} onSaved={() => undefined} />,
    );
    const overlay = container.firstElementChild;
    const form = container.querySelector("form");

    expect(overlay?.className).toContain("overflow-y-auto");
    expect(form?.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(form?.className).toContain("overflow-y-auto");
  });
});
