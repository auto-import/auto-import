"use client";
import { useEffect, useState } from "react";
import { adminApi, type OfficeSummary } from "@/lib/admin-api";
import {
  createTreasuryAccount,
  transferTreasury,
  updateTreasuryAccount,
  type ApiTreasuryAccount,
} from "@/lib/finance-api";
import { inputClass, buttonClass } from "./common";
export default function TreasuryControls({
  accounts,
  onSaved,
}: {
  accounts: ApiTreasuryAccount[];
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"account" | "transfer" | null>(null);
  const [offices, setOffices] = useState<OfficeSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    officeId: "",
    currency: "DZD",
    type: "CASH",
    openingBalance: "0",
    sourceAccountId: "",
    destinationAccountId: "",
    amount: "",
    destinationAmount: "",
    reference: "",
    editId: "",
    status: "ACTIVE",
  });
  const [key, setKey] = useState("");
  useEffect(() => {
    adminApi
      .lookupOffices()
      .then(setOffices)
      .catch((e) => setError(e.message));
  }, []);
  const field = (name: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [name]: value }));
  const source = accounts.find((a) => a.id === form.sourceAccountId);
  const destination = accounts.find((a) => a.id === form.destinationAccountId);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          className={buttonClass}
          onClick={() => {
            setMode("account");
            setError("");
          }}
        >
          Configurer un compte
        </button>
        <button
          className={buttonClass}
          onClick={() => {
            setMode("transfer");
            setKey(crypto.randomUUID());
            setError("");
          }}
        >
          Transfert de trésorerie
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {mode && (
        <form
          className="card grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (mode === "account") {
                if (form.editId)
                  await updateTreasuryAccount(form.editId, {
                    officeId: form.officeId,
                    name: form.name,
                    status: form.status,
                  });
                else
                  await createTreasuryAccount({
                    code: form.code,
                    name: form.name,
                    officeId: form.officeId,
                    currency: form.currency,
                    type: form.type,
                    openingBalance: Number(form.openingBalance),
                  });
              } else
                await transferTreasury({
                  sourceAccountId: form.sourceAccountId,
                  destinationAccountId: form.destinationAccountId,
                  amount: Number(form.amount),
                  destinationAmount:
                    source?.currency !== destination?.currency
                      ? Number(form.destinationAmount)
                      : undefined,
                  reference: form.reference,
                  idempotencyKey: key,
                });
              await onSaved();
              setMode(null);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Enregistrement impossible",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "account" ? (
            <>
              <label>
                <span className="field-label">Compte</span>
                <select
                  className={inputClass}
                  value={form.editId}
                  onChange={(e) => {
                    const account = accounts.find(
                      (a) => a.id === e.target.value,
                    );
                    setForm((f) => ({
                      ...f,
                      editId: e.target.value,
                      name: account?.name ?? "",
                      officeId: account?.officeId ?? "",
                      status: account?.status ?? "ACTIVE",
                    }));
                  }}
                >
                  <option value="">Nouveau compte</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Bureau *</span>
                <select
                  required
                  className={inputClass}
                  value={form.officeId}
                  onChange={(e) => field("officeId", e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Nom *</span>
                <input
                  required
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => field("name", e.target.value)}
                />
              </label>
              {form.editId ? (
                <label>
                  <span className="field-label">Statut</span>
                  <select
                    className={inputClass}
                    value={form.status}
                    onChange={(e) => field("status", e.target.value)}
                  >
                    <option value="ACTIVE">Actif</option>
                    <option value="INACTIVE">Inactif</option>
                  </select>
                </label>
              ) : (
                <>
                  <label>
                    <span className="field-label">Code *</span>
                    <input
                      required
                      className={inputClass}
                      value={form.code}
                      onChange={(e) => field("code", e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="field-label">Devise</span>
                    <select
                      className={inputClass}
                      value={form.currency}
                      onChange={(e) => field("currency", e.target.value)}
                    >
                      {["DZD", "CNY", "USD"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Type</span>
                    <select
                      className={inputClass}
                      value={form.type}
                      onChange={(e) => field("type", e.target.value)}
                    >
                      <option value="CASH">Caisse</option>
                      <option value="BANK">Banque</option>
                      <option value="CURRENCY">Compte en devises</option>
                      <option value="OTHER">Autre</option>
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Solde initial</span>
                    <input
                      required
                      type="number"
                      step="0.01"
                      className={inputClass}
                      value={form.openingBalance}
                      onChange={(e) => field("openingBalance", e.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          ) : (
            <>
              {(["sourceAccountId", "destinationAccountId"] as const).map(
                (name) => (
                  <label key={name}>
                    <span className="field-label">
                      {name === "sourceAccountId"
                        ? "Compte débité"
                        : "Compte crédité"}{" "}
                      *
                    </span>
                    <select
                      required
                      className={inputClass}
                      value={form[name]}
                      onChange={(e) => field(name, e.target.value)}
                    >
                      <option value="">Sélectionner</option>
                      {accounts
                        .filter((a) => a.status === "ACTIVE" && a.officeId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name} · {a.currency}
                          </option>
                        ))}
                    </select>
                  </label>
                ),
              )}
              <label>
                <span className="field-label">
                  Montant débité {source?.currency} *
                </span>
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  className={inputClass}
                  value={form.amount}
                  onChange={(e) => field("amount", e.target.value)}
                />
              </label>
              {source?.currency !== destination?.currency && (
                <label>
                  <span className="field-label">
                    Montant reçu {destination?.currency} *
                  </span>
                  <input
                    required
                    min="0.01"
                    step="0.01"
                    type="number"
                    className={inputClass}
                    value={form.destinationAmount}
                    onChange={(e) => field("destinationAmount", e.target.value)}
                  />
                </label>
              )}
              <label>
                <span className="field-label">Référence *</span>
                <input
                  required
                  className={inputClass}
                  value={form.reference}
                  onChange={(e) => field("reference", e.target.value)}
                />
              </label>
              <p className="text-sm text-muted">
                Le transfert modifie les deux comptes. Il n’entre pas dans le
                chiffre d’affaires ni dans les coûts.
              </p>
            </>
          )}
          <div className="flex gap-3">
            <button disabled={busy} className={buttonClass}>
              Enregistrer
            </button>
            <button type="button" disabled={busy} onClick={() => setMode(null)}>
              Fermer
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
