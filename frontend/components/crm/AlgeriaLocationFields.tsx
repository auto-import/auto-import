"use client";

import { ALGERIA_WILAYAS } from "@auto-import/contracts";
import type { ApiCrmReference } from "@/lib/crm-api";

export function isAlgeriaCountry(country?: ApiCrmReference | null) {
  if (!country) return false;
  const code = country.code.toUpperCase();
  const label = country.labelFr
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return ["DZ", "DZA", "ALGERIE"].includes(code) || label === "ALGERIE";
}

export default function AlgeriaLocationFields({
  references,
  countryId,
  wilaya,
  city,
  inputClass,
  onChange,
}: {
  references: ApiCrmReference[];
  countryId: string;
  wilaya: string;
  city: string;
  inputClass: string;
  onChange: (values: {
    countryId: string;
    wilaya: string;
    city: string;
  }) => void;
}) {
  const countries = references.filter(
    (item) => item.kind === "COUNTRY" && item.active,
  );
  const algeria = isAlgeriaCountry(
    countries.find((country) => country.id === countryId),
  );
  const selectedWilaya = ALGERIA_WILAYAS.find(
    (candidate) => candidate.name === wilaya,
  );

  return (
    <>
      <select
        className={inputClass}
        value={countryId}
        onChange={(event) =>
          onChange({ countryId: event.target.value, wilaya: "", city: "" })
        }
      >
        <option value="">Pays</option>
        {countries.map((item) => (
          <option key={item.id} value={item.id}>
            {item.labelFr}
          </option>
        ))}
      </select>
      {algeria ? (
        <>
          <select
            required
            aria-label="Wilaya"
            className={inputClass}
            value={wilaya}
            onChange={(event) =>
              onChange({ countryId, wilaya: event.target.value, city: "" })
            }
          >
            <option value="">Sélectionner une wilaya</option>
            {ALGERIA_WILAYAS.map((item) => (
              <option key={item.code} value={item.name}>
                {item.code} — {item.name}
              </option>
            ))}
          </select>
          <select
            required
            aria-label="Ville / Commune"
            className={inputClass}
            disabled={!selectedWilaya}
            value={city}
            onChange={(event) =>
              onChange({ countryId, wilaya, city: event.target.value })
            }
          >
            <option value="">Sélectionner une commune</option>
            {selectedWilaya?.communes.map((commune) => (
              <option key={commune} value={commune}>
                {commune}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <input
            className={inputClass}
            placeholder="Région / Wilaya"
            value={wilaya}
            onChange={(event) =>
              onChange({ countryId, wilaya: event.target.value, city })
            }
          />
          <input
            className={inputClass}
            placeholder="Ville / Commune"
            value={city}
            onChange={(event) =>
              onChange({ countryId, wilaya, city: event.target.value })
            }
          />
        </>
      )}
    </>
  );
}
