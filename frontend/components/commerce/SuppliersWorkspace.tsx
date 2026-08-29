"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Archive,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  History,
  Mail,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  Truck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import {
  commerceApi,
  type ApiPartner,
  type ApiPartnerContact,
  type ApiPartnerIncident,
  type ApiPartnerPurchase,
  type ApiPartnerPayment,
  type ApiPartnerGedLink,
  type ApiPartnerDossierLink,
  type ApiOffer,
} from "@/lib/commerce-api";
import {
  buttonClass,
  EmptyState,
  ErrorState,
  formatMoney,
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
  supplierType: "VEHICLE",
  whatsapp: "",
  wechat: "",
  preferredCurrency: "USD",
  incoterms: "",
  averageLeadTimeDays: "",
  specialties: "",
  notes: "",
};

type SupplierTab =
  | "apercu"
  | "contacts"
  | "offres"
  | "achats"
  | "vehicules"
  | "documents"
  | "paiements"
  | "incidents"
  | "historique";

export default function SuppliersWorkspace() {
  const [items, setItems] = useState<ApiPartner[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ApiPartner | null>(null);
  const [activeTab, setActiveTab] = useState<SupplierTab>("apercu");
  const [editing, setEditing] = useState<ApiPartner | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  // Sub-resource modals
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
    preferred: false,
  });
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    title: "",
    description: "",
    severity: "MEDIUM",
    type: "QUALITY",
  });
  const [submittingSub, setSubmittingSub] = useState(false);

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

  const selectSupplier = async (partnerId: string) => {
    try {
      const full = await commerceApi.partners.get(partnerId);
      setSelected(full);
      setActiveTab("apercu");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    }
  };

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
            supplierType: partner.supplierType ?? "VEHICLE",
            whatsapp: partner.whatsapp ?? "",
            wechat: partner.wechat ?? "",
            preferredCurrency: partner.preferredCurrency ?? "USD",
            incoterms: (partner.incoterms ?? []).join(", "),
            averageLeadTimeDays: String(partner.averageLeadTimeDays ?? ""),
            specialties: (partner.specialties ?? []).join(", "),
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
      incoterms: form.incoterms
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
      averageLeadTimeDays: form.averageLeadTimeDays
        ? Number(form.averageLeadTimeDays)
        : undefined,
    };
    try {
      if (editing) await commerceApi.partners.update(editing.id, payload);
      else await commerceApi.partners.create(payload);
      setEditing(null);
      setShowForm(false);
      setForm(blank);
      await load();
      if (selected) await selectSupplier(selected.id);
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

  const handleStatusTransition = async (newStatus: string) => {
    if (!selected) return;
    try {
      await commerceApi.partners.transition(selected.id, newStatus);
      await selectSupplier(selected.id);
      await load();
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : "Transition impossible");
    }
  };

  const handleAddContact = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSubmittingSub(true);
    try {
      await commerceApi.partners.addContact(selected.id, contactForm);
      setShowContactModal(false);
      setContactForm({
        name: "",
        role: "",
        email: "",
        phone: "",
        preferred: false,
      });
      await selectSupplier(selected.id);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Erreur lors de l'ajout du contact",
      );
    } finally {
      setSubmittingSub(false);
    }
  };

  const handleAddIncident = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSubmittingSub(true);
    try {
      await commerceApi.partners.addIncident(selected.id, incidentForm);
      setShowIncidentModal(false);
      setIncidentForm({
        title: "",
        description: "",
        severity: "MEDIUM",
        type: "QUALITY",
      });
      await selectSupplier(selected.id);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'ajout de l'incident",
      );
    } finally {
      setSubmittingSub(false);
    }
  };

  const tabs: Array<{ id: SupplierTab; label: string; count?: number }> = [
    { id: "apercu", label: "Aperçu" },
    {
      id: "contacts",
      label: "Contacts",
      count: selected?.contacts?.length ?? 0,
    },
    {
      id: "offres",
      label: "Offres",
      count: selected?.chinaOffers?.length ?? 0,
    },
    {
      id: "achats",
      label: "Achats",
      count: selected?.purchases?.length ?? 0,
    },
    {
      id: "vehicules",
      label: "Véhicules",
      count: selected?._count?.suppliedVehicles ?? 0,
    },
    {
      id: "documents",
      label: "Documents",
      count: selected?.gedLinks?.length ?? 0,
    },
    {
      id: "paiements",
      label: "Paiements",
      count: selected?.supplierPayments?.length ?? 0,
    },
    {
      id: "incidents",
      label: "Incidents",
      count: selected?.incidents?.length ?? 0,
    },
    { id: "historique", label: "Historique" },
  ];

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
                  onClick={() => void selectSupplier(partner.id)}
                  className="grid w-full grid-cols-[1fr_auto] gap-4 p-4 text-left hover:bg-surface transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{partner.name}</p>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        {partner.supplierType ?? "Fournisseur"}
                      </span>
                    </div>
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
                        partner.status === "active" ? "text-emerald-700 font-semibold" : ""
                      }
                    >
                      {partner.supplierStatus ?? partner.status}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* 9-Tab Detail Workspace Modal */}
      {selected && !editing && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelected(null)}
        >
          <section
            className="card flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden p-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border p-6">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold">{selected.name}</h2>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
                      {selected.supplierStatus ?? "TO_VERIFY"}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {[selected.city, selected.country, selected.supplierType]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-button border px-3 py-1.5 text-xs font-semibold hover:bg-surface"
                  onClick={() => openForm(selected)}
                >
                  <Pencil className="mr-1.5 inline h-3.5 w-3.5" />
                  Modifier
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="p-1 text-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs (9 tabs) */}
            <div className="flex overflow-x-auto border-b border-border px-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* TAB 1: APERÇU */}
              {activeTab === "apercu" && (
                <div className="space-y-6">
                  {selected.kpis && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-card border p-3">
                        <p className="text-xs uppercase text-muted">Offres actives</p>
                        <p className="text-xl font-bold text-emerald-600">
                          {selected.kpis.activeOffers}
                        </p>
                      </div>
                      <div className="rounded-card border p-3">
                        <p className="text-xs uppercase text-muted">Achats cumulés</p>
                        <p className="text-xl font-bold">
                          {formatMoney(
                            selected.kpis.amountPurchased,
                            selected.preferredCurrency ?? "USD",
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {selected.kpis.totalPurchases} commande(s)
                        </p>
                      </div>
                      <div className="rounded-card border p-3">
                        <p className="text-xs uppercase text-muted">Solde restant dû</p>
                        <p className="text-xl font-bold text-amber-600">
                          {formatMoney(
                            selected.kpis.supplierBalance,
                            selected.preferredCurrency ?? "USD",
                          )}
                        </p>
                      </div>
                      <div className="rounded-card border p-3">
                        <p className="text-xs uppercase text-muted">Délai moyen</p>
                        <p className="text-xl font-bold">
                          {selected.kpis.averageLeadTimeDays ?? "—"} jours
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-6 md:grid-cols-2">
                    <section className="space-y-3 rounded-card border p-4">
                      <h3 className="font-bold text-sm">Coordonnées commerciales</h3>
                      <dl className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted">Contact principal</dt>
                          <dd className="font-medium">{selected.contactPerson || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Téléphone</dt>
                          <dd className="font-medium">{selected.phone || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Email</dt>
                          <dd className="font-medium">{selected.email || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">WhatsApp / WeChat</dt>
                          <dd className="font-medium">
                            {[selected.whatsapp, selected.wechat].filter(Boolean).join(" / ") || "—"}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Adresse</dt>
                          <dd className="font-medium">{selected.address || "—"}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="space-y-3 rounded-card border p-4">
                      <h3 className="font-bold text-sm">Conditions d&apos;approvisionnement</h3>
                      <dl className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted">Devise préférée</dt>
                          <dd className="font-medium">{selected.preferredCurrency ?? "USD"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Conditions de paiement</dt>
                          <dd className="font-medium">{selected.paymentTerms || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Incoterms supportés</dt>
                          <dd className="font-medium">{(selected.incoterms ?? []).join(", ") || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Conditions de livraison</dt>
                          <dd className="font-medium">{selected.deliveryTerms || "—"}</dd>
                        </div>
                      </dl>
                    </section>
                  </div>

                  {/* Verification status transition actions */}
                  <div className="flex items-center justify-between rounded-card bg-surface p-4 text-sm">
                    <div>
                      <p className="font-semibold">Statut de vérification ERP</p>
                      <p className="text-xs text-muted">
                        Validation de conformité fournisseur et scoring opérationnel.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {selected.supplierStatus !== "ACTIVE" && (
                        <button
                          onClick={() => void handleStatusTransition("ACTIVE")}
                          className="rounded-button bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Valider le fournisseur
                        </button>
                      )}
                      {selected.supplierStatus !== "SUSPENDED" && (
                        <button
                          onClick={() => void handleStatusTransition("SUSPENDED")}
                          className="rounded-button border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                        >
                          Suspendre
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CONTACTS */}
              {activeTab === "contacts" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm">Annuaire des contacts</h3>
                    <button
                      onClick={() => setShowContactModal(true)}
                      className="rounded-button bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      <Plus className="mr-1 inline h-3.5 w-3.5" />
                      Ajouter un contact
                    </button>
                  </div>
                  {selected.contacts && selected.contacts.length > 0 ? (
                    <div className="divide-y divide-border rounded-card border">
                      {selected.contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between p-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold">
                              {contact.name}
                              {contact.preferred && (
                                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                  Principal
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted">{contact.role || "Contact"}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p>{contact.phone || "—"}</p>
                            <p className="text-muted">{contact.email || "—"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="Aucun contact enregistré." />
                  )}
                </div>
              )}

              {/* TAB 3: OFFRES */}
              {activeTab === "offres" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm">Offres véhicules Chine</h3>
                  {selected.chinaOffers && selected.chinaOffers.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {selected.chinaOffers.map((offer) => (
                        <div
                          key={offer.id}
                          className="rounded-card border p-3 text-sm space-y-1"
                        >
                          <div className="flex justify-between">
                            <p className="font-bold">{offer.brand} {offer.model}</p>
                            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
                              {offer.offerStatus ?? offer.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted">Réf: {offer.reference}</p>
                          <p className="font-semibold text-primary">
                            Prix fournisseur: {formatMoney(offer.supplierPrice ?? offer.purchasePrice, offer.currency)}
                          </p>
                          <p className="text-xs text-muted">
                            Qté disponible: {offer.availableQuantity}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="Aucune offre enregistrée pour ce fournisseur." />
                  )}
                </div>
              )}

              {/* TAB 4: ACHATS */}
              {activeTab === "achats" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm">Commandes d&apos;achat</h3>
                  {selected.purchases && selected.purchases.length > 0 ? (
                    <div className="divide-y divide-border rounded-card border">
                      {selected.purchases.map((purchase) => (
                        <div
                          key={purchase.id}
                          className="flex items-center justify-between p-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold">Achat #{purchase.id.slice(0, 8)}</p>
                            <p className="text-xs text-muted">
                              {new Date(purchase.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">
                              {formatMoney(purchase.purchasePrice, purchase.currency)}
                            </p>
                            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
                              {purchase.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="Aucune commande d&apos;achat enregistrée." />
                  )}
                </div>
              )}

              {/* TAB 5: VÉHICULES */}
              {activeTab === "vehicules" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm">Véhicules approvisionnés</h3>
                  <div className="rounded-card border p-4 text-center">
                    <p className="text-2xl font-bold text-primary">
                      {selected._count?.suppliedVehicles ?? 0}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      Véhicule(s) enregistré(s) dans le parc avec ce fournisseur source.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 6: DOCUMENTS */}
              {activeTab === "documents" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm">Documents GED associés</h3>
                  {selected.gedLinks && selected.gedLinks.length > 0 ? (
                    <div className="divide-y divide-border rounded-card border">
                      {selected.gedLinks.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center justify-between p-3 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted" />
                            <p className="font-medium">Document GED #{link.documentId.slice(0, 8)}</p>
                          </div>
                          <a
                            href={`/api/ged/documents/${link.documentId}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-button border px-2.5 py-1 text-xs font-semibold hover:bg-surface"
                          >
                            Télécharger
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="Aucun document GED lié à ce fournisseur." />
                  )}
                </div>
              )}

              {/* TAB 7: PAIEMENTS */}
              {activeTab === "paiements" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm">Règlements & Décaissements Fournisseur</h3>
                  {selected.supplierPayments && selected.supplierPayments.length > 0 ? (
                    <div className="divide-y divide-border rounded-card border">
                      {selected.supplierPayments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between p-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold">
                              {formatMoney(payment.amount, payment.currency)}
                            </p>
                            <p className="text-xs text-muted">
                              {payment.paymentDate
                                ? new Date(payment.paymentDate).toLocaleDateString()
                                : "Date non précisée"}
                            </p>
                          </div>
                          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium">
                            {payment.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="Aucun règlement fournisseur enregistré." />
                  )}
                </div>
              )}

              {/* TAB 8: INCIDENTS */}
              {activeTab === "incidents" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm">Journal des incidents & réclamations</h3>
                    <button
                      onClick={() => setShowIncidentModal(true)}
                      className="rounded-button bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      <Plus className="mr-1 inline h-3.5 w-3.5" />
                      Signaler un incident
                    </button>
                  </div>
                  {selected.incidents && selected.incidents.length > 0 ? (
                    <div className="divide-y divide-border rounded-card border">
                      {selected.incidents.map((incident) => (
                        <div key={incident.id} className="p-3 text-sm space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-red-700">{incident.title}</p>
                            <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-bold text-red-800">
                              {incident.severity} · {incident.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted">{incident.description}</p>
                          <p className="text-[10px] text-muted">
                            Survenu le: {new Date(incident.occurredAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="Aucun incident signalé." />
                  )}
                </div>
              )}

              {/* TAB 9: HISTORIQUE */}
              {activeTab === "historique" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm">Historique des liaisons & dossiers</h3>
                  {selected.dossierLinks && selected.dossierLinks.length > 0 ? (
                    <div className="divide-y divide-border rounded-card border">
                      {selected.dossierLinks.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center justify-between p-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold">Dossier {link.dossier?.reference}</p>
                            <p className="text-xs text-muted">
                              Lié le {new Date(link.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
                            {link.dossier?.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="Aucun dossier associé pour le moment." />
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between border-t border-border p-4">
              <button
                className="rounded-button border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                onClick={() => void archive(selected)}
              >
                <Archive className="mr-2 inline h-4 w-4" />
                Archiver
              </button>
              <button
                className="rounded-button border px-4 py-2 text-sm hover:bg-surface"
                onClick={() => setSelected(null)}
              >
                Fermer
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Add Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleAddContact}
            className="card w-full max-w-md space-y-4 p-6"
          >
            <h3 className="font-bold text-base">Nouveau contact fournisseur</h3>
            <label>
              <span className="field-label">Nom complet *</span>
              <input
                required
                className={inputClass}
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              />
            </label>
            <label>
              <span className="field-label">Rôle / Fonction</span>
              <input
                className={inputClass}
                placeholder="Ex: Commercial Export"
                value={contactForm.role}
                onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
              />
            </label>
            <label>
              <span className="field-label">Téléphone</span>
              <input
                className={inputClass}
                placeholder="+86 138..."
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              />
            </label>
            <label>
              <span className="field-label">Email</span>
              <input
                type="email"
                className={inputClass}
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={contactForm.preferred}
                onChange={(e) => setContactForm({ ...contactForm, preferred: e.target.checked })}
              />
              Contact principal privilégié
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-button border px-3 py-1.5 text-sm"
                onClick={() => setShowContactModal(false)}
              >
                Annuler
              </button>
              <button disabled={submittingSub} className={buttonClass}>
                {submittingSub ? "Enregistrement..." : "Ajouter"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Incident Modal */}
      {showIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleAddIncident}
            className="card w-full max-w-md space-y-4 p-6"
          >
            <h3 className="font-bold text-base">Signaler un incident fournisseur</h3>
            <label>
              <span className="field-label">Titre de l&apos;incident *</span>
              <input
                required
                className={inputClass}
                placeholder="Ex: Retard d'expédition / Non-conformité"
                value={incidentForm.title}
                onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })}
              />
            </label>
            <label>
              <span className="field-label">Gravité</span>
              <select
                className={inputClass}
                value={incidentForm.severity}
                onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}
              >
                <option value="LOW">Faible</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Élevée</option>
                <option value="CRITICAL">Critique</option>
              </select>
            </label>
            <label>
              <span className="field-label">Type</span>
              <select
                className={inputClass}
                value={incidentForm.type}
                onChange={(e) => setIncidentForm({ ...incidentForm, type: e.target.value })}
              >
                <option value="QUALITY">Qualité véhicule</option>
                <option value="DELAY">Délai / Logistique</option>
                <option value="DOCUMENTATION">Documents / Douane</option>
                <option value="FINANCIAL">Paiement / Facturation</option>
                <option value="OTHER">Autre</option>
              </select>
            </label>
            <label>
              <span className="field-label">Description détaillée *</span>
              <textarea
                required
                className={inputClass}
                rows={3}
                value={incidentForm.description}
                onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-button border px-3 py-1.5 text-sm"
                onClick={() => setShowIncidentModal(false)}
              >
                Annuler
              </button>
              <button disabled={submittingSub} className={buttonClass}>
                {submittingSub ? "Enregistrement..." : "Signaler"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit / Create Partner Form */}
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
                  "supplierType",
                  "whatsapp",
                  "wechat",
                  "preferredCurrency",
                  "incoterms",
                  "averageLeadTimeDays",
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
                        supplierType: "Type fournisseur",
                        whatsapp: "WhatsApp",
                        wechat: "WeChat",
                        preferredCurrency: "Devise préférée",
                        incoterms: "Incoterms (séparés par des virgules)",
                        averageLeadTimeDays: "Délai moyen (jours)",
                        specialties: "Spécialités (séparées par des virgules)",
                      }[key]
                    }
                  </span>
                  <input
                    required={key === "name"}
                    className={inputClass}
                    type={key === "averageLeadTimeDays" ? "number" : "text"}
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
    </>
  );
}
