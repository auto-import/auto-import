"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import { commerceApi, type ApiOffer } from "@/lib/commerce-api";

export default function PrivateOfferGallery({
  offer,
  onReplaced,
}: {
  offer: ApiOffer;
  onReplaced?: (offer: ApiOffer) => void;
}) {
  const { hasPermission } = useAuth();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [replacement, setReplacement] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const created: string[] = [];
    void Promise.all(
      (offer.photos ?? []).map(async (photo) => {
        const blob = await commerceApi.offers.photoBlob(photo.id);
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [photo.id, url] as const;
      }),
    )
      .then((entries) => {
        if (active) setUrls(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      active = false;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [offer.photos]);

  async function replace() {
    if (replacement.length !== 3) {
      setError("Sélectionnez exactement trois photos distinctes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await commerceApi.offers.replacePhotos(
        offer.id,
        replacement,
      );
      setReplacement([]);
      onReplaced?.(updated);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Remplacement impossible",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="mb-4 font-semibold">Galerie privée</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => {
          const photo = offer.photos?.[index];
          return (
            <div
              key={photo?.id ?? index}
              className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100"
            >
              {photo && urls[photo.id] ? (
                <Image
                  unoptimized
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  src={urls[photo.id]}
                  alt={`${offer.brand} ${offer.model} photo ${index + 1}`}
                  className="object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                  Photo {index + 1}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {hasPermission(Permission.OFFERS_WRITE) && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <label className="field-label" htmlFor="offer-replacement-photos">
            Remplacer les trois photos (la première sera la couverture)
          </label>
          <input
            id="offer-replacement-photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) =>
              setReplacement(Array.from(event.target.files ?? []))
            }
            className="mt-2 block w-full text-sm"
          />
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          <button
            type="button"
            disabled={busy || replacement.length !== 3}
            onClick={() => void replace()}
            className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Remplacement…" : "Remplacer la galerie"}
          </button>
        </div>
      )}
    </section>
  );
}
