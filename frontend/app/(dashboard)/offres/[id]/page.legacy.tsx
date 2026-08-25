"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar, StatusBadge } from "@/components";
import { getOffreById } from "@/lib/mockData";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import {
  OFFRE_STATUT_LABELS,
  OFFRE_STATUT_VARIANTS,
  formatDate,
} from "@/lib/constants";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Clock,
  Package,
  Edit,
  FolderOpen,
  ExternalLink,
  Car,
} from "lucide-react";
import OffreFormModal from "@/components/OffreFormModal";

interface OffreDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function OffreDetailPage({ params }: OffreDetailPageProps) {
  const { id } = React.use(params);
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [showEditModal, setShowEditModal] = useState(false);
  const [, setRefreshKey] = useState(0);

  const offre = getOffreById(id);
  const canViewPrixAchat = hasPermission(Permission.OFFERS_READ_PURCHASE_PRICE);

  if (!offre) {
    return (
      <div className="flex flex-col h-full">
        <Topbar title="Offre introuvable" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Offre introuvable
            </h2>
            <p className="text-muted-foreground mb-6">
              L&apos;offre demandée n&apos;existe pas ou a été supprimée.
            </p>
            <button
              onClick={() => router.push("/offres")}
              className="btn-primary inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour aux offres
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Topbar title={`Offre ${offre.reference}`} />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div>
          <button
            onClick={() => router.push("/offres")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux offres
          </button>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">
                {offre.reference}
              </h1>
              <StatusBadge
                label={OFFRE_STATUT_LABELS[offre.statut]}
                variant={OFFRE_STATUT_VARIANTS[offre.statut]}
              />
            </div>
            <p className="text-lg text-foreground">
              {offre.marque} {offre.modele}
              {offre.version ? ` ${offre.version}` : ""}
            </p>
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {offre.annee}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${offre.type === "neuf" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
              >
                {offre.type === "neuf" ? "Neuf" : "Occasion"}
              </span>
              {offre.fournisseur_nom && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {offre.fournisseur_nom}
                  {offre.ville_fournisseur
                    ? `, ${offre.ville_fournisseur}`
                    : ""}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() =>
                router.push(`/dossiers/creer?offre_id=${offre.id}`)
              }
              className="btn-primary inline-flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              Créer dossier
            </button>
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 text-sm font-medium text-foreground bg-accent hover:bg-accent-hover rounded-card transition-colors inline-flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Modifier
            </button>
          </div>
        </div>

        {offre.photos && offre.photos.length > 0 && (
          <div className="card overflow-hidden">
            <div className="relative aspect-[16/7] w-full bg-muted">
              <img
                src={offre.photos[0]}
                alt={`${offre.marque} ${offre.modele}`}
                className="w-full h-full object-cover"
              />
            </div>
            {offre.photos.length > 1 && (
              <div className="flex gap-2 p-3 overflow-x-auto">
                {offre.photos.map((photo, index) => (
                  <div
                    key={index}
                    className="relative flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-foreground/20 transition-colors"
                  >
                    <img
                      src={photo}
                      alt={`${offre.marque} ${offre.modele} ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6">
            <h3 className="section-title mb-4">
              <Car className="w-4 h-4 inline-block mr-1.5" />
              Informations véhicule
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoItem label="Marque" value={offre.marque} />
              <InfoItem label="Modèle" value={offre.modele} />
              <InfoItem label="Version" value={offre.version} />
              <InfoItem label="Année" value={String(offre.annee)} />
              <InfoItem
                label="État"
                value={offre.type === "neuf" ? "Neuf" : "Occasion"}
              />
              <InfoItem
                label="Kilométrage"
                value={
                  offre.kilometrage
                    ? `${offre.kilometrage.toLocaleString("fr-FR")} km`
                    : "—"
                }
              />
              <InfoItem label="Motorisation" value={offre.motorisation} />
              <InfoItem label="Couleur" value={offre.couleur} />
            </div>
          </div>

          <div className="card p-6">
            <h3 className="section-title mb-4">
              <Package className="w-4 h-4 inline-block mr-1.5" />
              Fournisseur & Tarification
            </h3>
            <div className="space-y-4">
              <div className="rounded-card border border-border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Fournisseur
                </p>
                <a
                  href={
                    offre.fournisseur_id
                      ? `/fournisseurs/${offre.fournisseur_id}`
                      : "#"
                  }
                  className="text-sm font-medium text-foreground hover:text-status-blue-text transition-colors inline-flex items-center gap-1"
                >
                  {offre.fournisseur_nom}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {offre.ville_fournisseur && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />
                    {offre.ville_fournisseur}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-card border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Prix CIF
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {offre.prix_cif.toLocaleString("fr-FR")} {offre.devise}
                  </p>
                </div>

                <div className="rounded-card border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Prix DDP
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {offre.prix_ddp.toLocaleString("fr-FR")} {offre.devise}
                  </p>
                </div>

                {canViewPrixAchat && offre.prix_achat_interne != null && (
                  <div className="rounded-card border border-border p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Prix d&apos;achat
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {offre.prix_achat_interne.toLocaleString("fr-FR")}{" "}
                      {offre.devise}
                    </p>
                  </div>
                )}

                <div className="rounded-card border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Devise
                  </p>
                  <p className="text-sm text-foreground">{offre.devise}</p>
                </div>

                <div className="rounded-card border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Validité
                  </p>
                  <p className="text-sm text-foreground">
                    {offre.date_validite
                      ? formatDate(offre.date_validite)
                      : "—"}
                  </p>
                </div>

                {offre.delai_estime_jours != null && (
                  <div className="rounded-card border border-border p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Délai estimé
                    </p>
                    <p className="text-sm text-foreground flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      {offre.delai_estime_jours} jours
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="section-title mb-4">
            <Package className="w-4 h-4 inline-block mr-1.5" />
            Disponibilité & Statut
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <InfoItem
              label="Quantité disponible"
              value={String(offre.quantite_disponible)}
            />
            <InfoItem label="Disponibilité" value={offre.disponibilite} />
            <InfoItem
              label="Statut"
              value={OFFRE_STATUT_LABELS[offre.statut]}
            />
            <InfoItem
              label="Date de création"
              value={formatDate(offre.date_creation)}
            />
          </div>
        </div>

        {offre.notes_internes && (
          <div className="card p-6">
            <h3 className="section-title mb-4">Notes internes</h3>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {offre.notes_internes}
            </p>
          </div>
        )}

        {offre.dossier_id && (
          <div className="card p-6">
            <h3 className="section-title mb-4">
              <FolderOpen className="w-4 h-4 inline-block mr-1.5" />
              Dossier associé
            </h3>
            <button
              onClick={() => router.push(`/dossiers/${offre.dossier_id}`)}
              className="text-sm font-medium text-status-blue-text hover:underline inline-flex items-center gap-1.5"
            >
              <FolderOpen className="w-4 h-4" />
              Voir le dossier
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {showEditModal && (
        <OffreFormModal
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            setRefreshKey((k) => k + 1);
          }}
          initialData={offre}
        />
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value?: string | number;
}) {
  return (
    <div className="rounded-card border border-border p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground">{value ?? "—"}</p>
    </div>
  );
}
