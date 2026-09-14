"use client";
import { useEffect, useState } from "react";
import {
  fetchPaymentAccounts,
  type ApiTreasuryAccount,
} from "@/lib/finance-api";
import { inputClass } from "./common";
export default function TreasuryAccountSelect({
  currency,
  officeId,
  value,
  onChange,
}: {
  currency: string;
  officeId?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [accounts, setAccounts] = useState<ApiTreasuryAccount[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetchPaymentAccounts()
      .then((rows) => {
        if (active) setAccounts(rows);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Comptes indisponibles");
      });
    return () => {
      active = false;
    };
  }, []);
  const eligible = accounts.filter(
    (a) => a.currency === currency && (!officeId || a.officeId === officeId),
  );
  return (
    <label className="block">
      <span className="field-label">Compte de trésorerie *</span>
      <select
        required
        aria-label="Compte de trésorerie"
        className={inputClass}
        value={eligible.some((a) => a.id === value) ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Sélectionner un compte</option>
        {eligible.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code} · {a.name} · {a.office?.name}
          </option>
        ))}
      </select>
      {error && <span role="alert">{error}</span>}
      {!error && !eligible.length && (
        <span className="text-xs text-muted">
          Aucun compte disponible dans cette devise. Configurez un compte dans
          Finance.
        </span>
      )}
    </label>
  );
}
