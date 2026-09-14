"use client";
import { useState } from "react";
import TreasuryAccountSelect from "./TreasuryAccountSelect";
import { buttonClass } from "./common";
export default function PaymentAccountDialog({
  currency,
  onClose,
  onConfirm,
}: {
  currency: string;
  onClose: () => void;
  onConfirm: (id: string, rateType: string) => Promise<void>;
}) {
  const [account, setAccount] = useState("");
  const [rateType, setRateType] = useState("COMMERCIAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        className="card w-full max-w-md space-y-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onConfirm(account, rateType);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Validation impossible");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="text-lg font-bold">Valider le paiement</h2>
        {currency !== "DZD" && (
          <label className="block">
            Type de taux
            <select
              className="w-full rounded border p-2"
              value={rateType}
              onChange={(e) => setRateType(e.target.value)}
            >
              <option value="COMMERCIAL">Commercial</option>
              <option value="BANK">Banque</option>
              <option value="INTERNAL">Interne</option>
              <option value="MANUAL">Manuel</option>
            </select>
          </label>
        )}
        <TreasuryAccountSelect
          currency={currency}
          value={account}
          onChange={setAccount}
        />
        {error && <p role="alert">{error}</p>}
        <button className={buttonClass} disabled={busy || !account}>
          Confirmer
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          Fermer
        </button>
      </form>
    </div>
  );
}
