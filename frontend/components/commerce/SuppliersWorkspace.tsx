"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, Building2, Pencil, Plus, Search, X } from "lucide-react";
import Topbar from "@/components/Topbar";
import { commerceApi, type ApiPartner } from "@/lib/commerce-api";
import {
  buttonClass,
  EmptyState,
  ErrorState,
  inputClass,
  LoadingState,
} from "./common";

const blank = {
  name: "",
  country: "Chine",
  city: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  website: "",
  paymentTerms: "",
  deliveryTerms: "",
  specialties: "",
  notes: "",
};

export default function SuppliersWorkspace() {
  const [items, setItems] = useState<ApiPartner[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ApiPartner | null>(null);
  const [editing, setEditing] = useState<ApiPartner | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(
        (
          await commerceApi.partners.list({
            search,
            status,
            type: "supplier",
            limit: 100,
          })
        ).items,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [search, status]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const openForm = (partner?: ApiPartner) => {
    setShowForm(true);
    setEditing(partner ?? null);
    setForm(
      partner
        ? {
            name: partner.name,
            country: partner.country ?? "",
            city: partner.city ?? "",
            contactPerson: partner.contactPerson ?? "",
            phone: partner.phone ?? "",
            email: partner.email ?? "",
            address: partner.address ?? "",
            website: partner.website ?? "",
            paymentTerms: partner.paymentTerms ?? "",
            deliveryTerms: partner.deliveryTerms ?? "",
            specialties: partner.specialties.join(", "),
            notes: partner.notes ?? "",
          }
        : blank,
    );
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      type: "supplier",
      specialties: form.specialties
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
    try {
      if (editing) await commerceApi.partners.update(editing.id, payload);
      else await commerceApi.partners.create(payload);
      setEditing(null);
      setShowForm(false);
      setForm(blank);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Enregistrement impossible",
      );
    } finally {
      setSaving(false);
    }
  };

  const archive = async (partner: ApiPartner) => {
    if (!window.confirm(`Archiver ${partner.name} ?`)) return;
    try {
      await commerceApi.partners.archive(partner.id);
      setSelected(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Archivage impossible",
      );
    }
  };

  return (
    <>
      <Topbar
        title="Fournisseurs"
        subtitle="Catalogue et relations d’approvisionnement"
      />
      <main className="space-y-5 p-8">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Nom, contact, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
            <option value="archived">Archivés</option>
          </select>
          <button className={buttonClass} onClick={() => openForm()}>
            <Plus className="mr-2 inline h-4 w-4" />
            Ajouter
          </button>
        </div>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState label="Aucun fournisseur trouvé." />
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="divide-y divide-border">
              {items.map((partner) => (
                <button
                  key={partner.id}
                  onClick={() => setSelected(partner)}
                  className="grid w-full grid-cols-[1fr_auto] gap-4 p-4 text-left hover:bg-surface"
                >
                  <div>
                    <p className="font-semibold">{partner.name}</p>
                    <p className="text-sm text-muted">
                      {[partner.city, partner.country, partner.contactPerson]
                        .filter(Boolean)
                        .join(" · ") || "Coordonnées non renseignées"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>{partner._count?.suppliedVehicles ?? 0} véhicules</p>
                    <p
                      className={
                        partner.status === "active" ? "text-green-700" : ""
                      }
                    >
                      {partner.status}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={save}
            className="card max-h-[90vh] w-full max-w-3xl space-y-4 overflow-auto p-6"
          >
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">
                {editing ? "Modifier le fournisseur" : "Nouveau fournisseur"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowForm(false);
                  setForm(blank);
                }}
              >
                <X />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  "name",
                  "country",
                  "city",
                  "contactPerson",
                  "phone",
                  "email",
                  "address",
                  "website",
                  "paymentTerms",
                  "deliveryTerms",
                  "specialties",
                ] as const
              ).map((key) => (
                <label
                  key={key}
                  className={
                    key === "address" || key === "specialties"
                      ? "md:col-span-2"
                      : ""
                  }
                >
                  <span className="field-label">
                    {
                      {
                        name: "Nom *",
                        country: "Pays",
                        city: "Ville",
                        contactPerson: "Contact",
                        phone: "Téléphone",
                        email: "Email",
                        address: "Adresse",
                        website: "Site web",
                        paymentTerms: "Conditions de paiement",
                        deliveryTerms: "Conditions de livraison",
                        specialties: "Spécialités (séparées par des virgules)",
                      }[key]
                    }
                  </span>
                  <input
                    required={key === "name"}
                    className={inputClass}
                    value={form[key]}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        [key]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              <span className="field-label">Notes internes</span>
              <textarea
                className={inputClass}
                value={form.notes}
                onChange={(e) =>
                  setForm((current) => ({ ...current, notes: e.target.value }))
                }
              />
            </label>
            <div className="flex justify-end">
              <button disabled={saving} className={buttonClass}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}
      {selected && !editing && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
        >
          <section
            className="card w-full max-w-2xl space-y-5 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex gap-3">
                <Building2 className="h-8 w-8" />
                <div>
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  <p className="text-sm text-muted">
                    {selected.city} · {selected.country}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelected(null)}>
                <X />
              </button>
            </div>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="text-muted">Contact</dt>
                <dd>{selected.contactPerson || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Téléphone</dt>
                <dd>{selected.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Email</dt>
                <dd>{selected.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Conditions</dt>
                <dd>{selected.paymentTerms || "—"}</dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-button border px-4 py-2 text-sm"
                onClick={() => openForm(selected)}
              >
                <Pencil className="mr-2 inline h-4 w-4" />
                Modifier
              </button>
              <button
                className="rounded-button border border-red-200 px-4 py-2 text-sm text-red-700"
                onClick={() => void archive(selected)}
              >
                <Archive className="mr-2 inline h-4 w-4" />
                Archiver
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
