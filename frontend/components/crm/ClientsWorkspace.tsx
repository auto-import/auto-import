"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import { crmApi, type ApiClient } from "@/lib/crm-api";

export default function ClientsWorkspace() {
  const router = useRouter();
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setClients((await crmApi.listClients({ limit: 100, search })).items);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <>
      <Topbar
        title="Clients"
        subtitle="Relation client — données CRM persistantes"
      />
      <main className="space-y-6 p-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label="Clients" value={clients.length} />
          <Kpi
            label="Actifs"
            value={
              clients.filter((client) => client.status === "active").length
            }
          />
          <Kpi
            label="Avec prochaine action"
            value={clients.filter((client) => client.nextActionAt).length}
          />
        </div>
        <div className="flex gap-3">
          <label className="relative min-w-64 flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              className="w-full rounded-input border border-border bg-background py-2 pl-9 pr-3 text-sm"
              placeholder="Nom, email ou téléphone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto flex items-center gap-2 rounded-button bg-foreground px-4 py-2 text-sm text-white"
          >
            <Plus className="h-4 w-4" />
            Ajouter un client
          </button>
        </div>
        {error && (
          <div className="rounded-card bg-status-red-bg p-4 text-status-red-text">
            <p>{error}</p>
            <button
              className="mt-2 flex items-center gap-1 text-sm"
              onClick={() => void load()}
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </button>
          </div>
        )}
        <div className="card overflow-x-auto p-0">
          {loading ? (
            <p className="p-12 text-center text-muted">
              Chargement des clients…
            </p>
          ) : clients.length === 0 ? (
            <p className="p-12 text-center text-muted">Aucun client trouvé.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="p-4">Client</th>
                  <th className="p-4">Contact</th>
                  <th className="p-4">Agent</th>
                  <th className="p-4">Dernière interaction</th>
                  <th className="p-4">Prochaine action</th>
                  <th className="p-4">Statut</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => router.push(`/crm/clients/${client.id}`)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface"
                  >
                    <td className="p-4 font-medium">
                      {client.firstName} {client.lastName}
                    </td>
                    <td className="p-4">
                      <p>{client.phone || "—"}</p>
                      <p className="text-xs text-muted">{client.email}</p>
                    </td>
                    <td className="p-4">
                      {client.assignee
                        ? `${client.assignee.firstName} ${client.assignee.lastName}`
                        : "—"}
                    </td>
                    <td className="p-4">
                      {formatDate(client.lastInteractionAt)}
                    </td>
                    <td className="p-4">{formatDate(client.nextActionAt)}</td>
                    <td className="p-4">
                      <span className="rounded-full bg-status-green-bg px-2 py-1 text-xs text-status-green-text">
                        {client.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
      {showForm && (
        <ClientForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function ClientForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    nationality: "DZ",
    nin: "",
    passportNumber: "",
    identityIssueDate: "",
    passportExpiry: "",
  });
  const [passportScan, setPassportScan] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const input =
    "rounded-input border border-border bg-background px-3 py-2 text-sm";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (passportScan) {
        await crmApi.createClientWithPassport(
          {
            ...values,
            phone: values.phone || undefined,
            email: values.email || undefined,
          },
          passportScan,
        );
      } else {
        await crmApi.createClient({
          ...values,
          phone: values.phone || undefined,
          email: values.email || undefined,
        });
      }
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Création impossible",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="card grid w-full max-w-lg gap-3 bg-background md:grid-cols-2"
      >
        <h2 className="text-lg font-semibold md:col-span-2">Nouveau client</h2>
        {error && (
          <p className="text-sm text-status-red-text md:col-span-2">{error}</p>
        )}
        <input
          required
          className={input}
          placeholder="Prénom"
          value={values.firstName}
          onChange={(event) =>
            setValues({ ...values, firstName: event.target.value })
          }
        />
        <input
          required
          className={input}
          placeholder="Nom"
          value={values.lastName}
          onChange={(event) =>
            setValues({ ...values, lastName: event.target.value })
          }
        />
        <input
          className={input}
          placeholder="Téléphone"
          value={values.phone}
          onChange={(event) =>
            setValues({ ...values, phone: event.target.value })
          }
        />
        <input
          type="email"
          className={input}
          placeholder="Email"
          value={values.email}
          onChange={(event) =>
            setValues({ ...values, email: event.target.value })
          }
        />
        <input
          className={input}
          placeholder="Nationalité (DZ ou pays)"
          value={values.nationality}
          onChange={(event) =>
            setValues({ ...values, nationality: event.target.value })
          }
        />
        <input
          className={input}
          inputMode="numeric"
          pattern="[0-9]{18}"
          maxLength={18}
          placeholder="NIN algérien (18 chiffres)"
          value={values.nin}
          onChange={(event) =>
            setValues({ ...values, nin: event.target.value })
          }
        />
        <input
          className={input}
          placeholder="Numéro de passeport"
          value={values.passportNumber}
          onChange={(event) =>
            setValues({ ...values, passportNumber: event.target.value })
          }
        />
        <label className="text-xs text-muted">
          Date d’émission
          <input
            type="date"
            className={`${input} mt-1 w-full`}
            value={values.identityIssueDate}
            onChange={(event) =>
              setValues({ ...values, identityIssueDate: event.target.value })
            }
          />
        </label>
        <label className="text-xs text-muted">
          Date d’expiration
          <input
            type="date"
            className={`${input} mt-1 w-full`}
            value={values.passportExpiry}
            onChange={(event) =>
              setValues({ ...values, passportExpiry: event.target.value })
            }
          />
        </label>
        <label className="text-xs text-muted">
          Scan passeport privé
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="mt-1 w-full"
            onChange={(event) =>
              setPassportScan(event.target.files?.[0] ?? null)
            }
          />
        </label>
        <div className="flex justify-end gap-2 md:col-span-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-button border border-border px-4 py-2 text-sm"
          >
            Annuler
          </button>
          <button
            disabled={saving}
            className="rounded-button bg-foreground px-4 py-2 text-sm text-white"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-background p-4 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString(getRuntimeLocale()) : "—";
}
