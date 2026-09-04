// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiUpload: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  apiDownload: vi.fn(),
  apiUpload: mocks.apiUpload,
}));

import { commerceApi } from "@/lib/commerce-api";

describe("China offer multipart API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializes nested vehicles once as JSON and leaves the multipart boundary to fetch", async () => {
    mocks.apiUpload.mockResolvedValue({ id: "offer-1" });
    const vehicles = [
      {
        brand: "Geely",
        model: "Coolray",
        condition: "new",
        supplierPrice: 12000,
        currency: "USD",
        quantity: 1,
      },
      {
        brand: "BYD",
        model: "Song Plus",
        condition: "new",
        supplierPrice: 18000,
        currency: "USD",
        quantity: 2,
      },
    ];
    const photos = [
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "one.jpg", {
        type: "image/jpeg",
      }),
    ];

    await commerceApi.offers.createWithPhotos(
      {
        supplierId: "00000000-0000-4000-8000-000000000001",
        brand: "Geely",
        model: "Coolray",
        vehicles,
        specification: {},
      },
      photos,
    );

    expect(mocks.apiUpload).toHaveBeenCalledTimes(1);
    const [path, body] = mocks.apiUpload.mock.calls[0] as [string, FormData];
    expect(path).toBe("/offers/with-photos");
    expect(body.get("vehicles")).toBe(JSON.stringify(vehicles));
    expect(body.get("specification")).toBe("{}");
    expect(body.getAll("photos")).toEqual(photos);
  });
});
