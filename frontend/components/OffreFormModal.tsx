"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createOffre, updateOffre, fournisseurs } from "@/lib/mockData";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import type { Offre } from "@/types";

interface OffreFormModalProps {
  onClose: () => void;
  onSaved: () => void;
  initialData?: Offre | null;
}

export default function OffreFormModal({
  onClose,
  onSaved,
  initialData,
}: OffreFormModalProps) {
  const { hasPermission } = useAuth();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    marque: initialData?.marque || "",
    modele: initialData?.modele || "",
    version: initialData?.version || "",
    annee: initialData?.annee || new Date().getFullYear(),
    type: initialData?.type || "occasion",
    kilometrage: initialData?.kilometrage || 0,
    motorisation: initialData?.motorisation || "",
    couleur: initialData?.couleur || "",
    fournisseur_id: initialData?.fournisseur_id || "",
    prix_achat_interne: initialData?.prix_achat_interne || 0,
    prix_cif: initialData?.prix_cif || 0,
    prix_ddp: initialData?.prix_ddp || 0,
    devise: initialData?.devise || "USD",
    date_validite: initialData?.date_validite || "",
    quantite_disponible: initialData?.quantite_disponible || 0,
    delai_estime_jours: initialData?.delai_estime_jours || 0,
    notes_internes: initialData?.notes_internes || "",
  });

  const inputCls =
    "w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text";
  const labelCls = "field-label mb-1";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (
      !form.marque ||
      !form.modele ||
      !form.annee ||
      !form.fournisseur_id ||
      !form.prix_cif ||
      !form.prix_ddp ||
      !form.quantite_disponible
    ) {
      setError("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    if (initialData) {
      updateOffre(initialData.id, form);
    } else {
      createOffre(form);
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-semibold text-text-primary">
            {initialData ? "Modifier l'offre" : "Nouvelle offre"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-accent text-text-secondary"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-card px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <section>
            <h3 className="section-title">Véhicule</h3>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className={labelCls}>Marque *</label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.marque}
                  onChange={(e) => setForm({ ...form, marque: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Modèle *</label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.modele}
                  onChange={(e) => setForm({ ...form, modele: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Version</label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.version}
                  onChange={(e) =>
                    setForm({ ...form, version: e.target.value })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Année *</label>
                <input
                  type="number"
                  className={inputCls}
                  value={form.annee}
                  onChange={(e) =>
                    setForm({ ...form, annee: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>État</label>
                <select
                  className={inputCls}
                  value={form.type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type: e.target.value as "neuf" | "occasion",
                    })
                  }
                >
                  <option value="neuf">Neuf</option>
                  <option value="occasion">Occasion</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Kilométrage</label>
                <input
                  type="number"
                  className={inputCls}
                  value={form.kilometrage}
                  onChange={(e) =>
                    setForm({ ...form, kilometrage: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Motorisation</label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.motorisation}
                  onChange={(e) =>
                    setForm({ ...form, motorisation: e.target.value })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Couleur</label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.couleur}
                  onChange={(e) =>
                    setForm({ ...form, couleur: e.target.value })
                  }
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="section-title">Fournisseur</h3>
            <div className="mt-3">
              <label className={labelCls}>Fournisseur *</label>
              <select
                className={inputCls}
                value={form.fournisseur_id}
                onChange={(e) =>
                  setForm({ ...form, fournisseur_id: e.target.value })
                }
              >
                <option value="">Sélectionner un fournisseur</option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom} - {f.ville}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section>
            <h3 className="section-title">Tarification</h3>
            <div className="grid grid-cols-2 gap-4 mt-3">
              {hasPermission(Permission.OFFERS_READ_PURCHASE_PRICE) && (
                <div>
                  <label className={labelCls}>Prix d&apos;achat interne</label>
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls}
                    value={form.prix_achat_interne || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        prix_achat_interne: Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>Prix CIF *</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={form.prix_cif}
                  onChange={(e) =>
                    setForm({ ...form, prix_cif: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Prix DDP *</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={form.prix_ddp}
                  onChange={(e) =>
                    setForm({ ...form, prix_ddp: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Devise</label>
                <select
                  className={inputCls}
                  value={form.devise}
                  onChange={(e) => setForm({ ...form, devise: e.target.value })}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="CNY">CNY</option>
                  <option value="DZD">DZD</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Date de validité</label>
                <input
                  type="date"
                  className={inputCls}
                  value={form.date_validite}
                  onChange={(e) =>
                    setForm({ ...form, date_validite: e.target.value })
                  }
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="section-title">Logistique</h3>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className={labelCls}>Quantité disponible *</label>
                <input
                  type="number"
                  className={inputCls}
                  value={form.quantite_disponible}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      quantite_disponible: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Délai estimé (jours)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={form.delai_estime_jours}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      delai_estime_jours: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="section-title">Notes</h3>
            <div className="mt-3">
              <label className={labelCls}>Notes internes</label>
              <textarea
                rows={4}
                className={inputCls}
                value={form.notes_internes}
                onChange={(e) =>
                  setForm({ ...form, notes_internes: e.target.value })
                }
              />
            </div>
          </section>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary bg-accent hover:bg-accent-hover rounded-card transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-status-blue-text hover:bg-status-blue-text/90 rounded-card transition-colors"
            >
              {initialData ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
