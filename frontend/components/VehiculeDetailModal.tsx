'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { StatusBadge } from '@/components';
import {
  VEHICULE_STATUT_LABELS,
  VEHICULE_STATUT_VARIANTS,
  VEHICLE_SOURCE_LABELS,
  VEHICLE_SOURCE_VARIANTS,
  VEHICULE_ETAT_LABELS,
  CARROSSERIE_LABELS,
  CARBURANT_LABELS,
  BOITE_LABELS,
  DIRECTION_LABELS,
  formatMontant,
  formatOffrePrix,
  formatDate,
} from '@/lib/constants';
import type { Vehicule } from '@/types';

interface VehiculeDetailModalProps {
  vehicule: Vehicule;
  onClose: () => void;
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 rounded-card border border-border">
      <p className="text-[11px] text-muted uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}

export default function VehiculeDetailModal({ vehicule, onClose }: VehiculeDetailModalProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = vehicule.photos;
  const selectedPhoto = photos[photoIndex] ?? photos[0];

  const specs: { label: string; value: string }[] = [
    { label: 'VIN', value: vehicule.vin || '—' },
    { label: 'Année', value: String(vehicule.annee) },
    {
      label: 'Kilométrage',
      value: vehicule.kilometrage != null ? `${vehicule.kilometrage.toLocaleString('fr-FR')} km` : '—',
    },
    {
      label: 'État',
      value: vehicule.etat ? VEHICULE_ETAT_LABELS[vehicule.etat] : '—',
    },
    {
      label: 'Carrosserie',
      value: vehicule.type_carrosserie ? CARROSSERIE_LABELS[vehicule.type_carrosserie] : '—',
    },
    {
      label: 'Carburant',
      value: vehicule.carburant ? CARBURANT_LABELS[vehicule.carburant] : '—',
    },
    {
      label: 'Boîte de vitesses',
      value: vehicule.boite ? BOITE_LABELS[vehicule.boite] : '—',
    },
    { label: 'Motorisation', value: vehicule.motorisation || '—' },
    {
      label: 'Puissance',
      value: vehicule.puissance_cv ? `${vehicule.puissance_cv} ch` : '—',
    },
    {
      label: 'Cylindrée',
      value: vehicule.cylindree_cc ? `${vehicule.cylindree_cc.toLocaleString('fr-FR')} cm³` : '—',
    },
    { label: 'Portes', value: vehicule.portes ? String(vehicule.portes) : '—' },
    { label: 'Places', value: vehicule.places ? String(vehicule.places) : '—' },
    {
      label: 'Direction',
      value: vehicule.direction ? DIRECTION_LABELS[vehicule.direction] : '—',
    },
    { label: 'Couleur extérieure', value: vehicule.couleur || '—' },
    { label: 'Intérieur', value: vehicule.couleur_interieur || '—' },
    { label: 'Garantie', value: vehicule.garantie || '—' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto card rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-6 py-4 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">
              {vehicule.marque} {vehicule.modele} {vehicule.annee}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatusBadge
                variant={VEHICULE_STATUT_VARIANTS[vehicule.statut]}
                label={VEHICULE_STATUT_LABELS[vehicule.statut]}
                size="sm"
              />
              {vehicule.etat && (
                <StatusBadge
                  variant={vehicule.etat === 'neuf' ? 'blue' : 'gray'}
                  label={VEHICULE_ETAT_LABELS[vehicule.etat]}
                  size="sm"
                />
              )}
              <StatusBadge
                variant={VEHICLE_SOURCE_VARIANTS[vehicule.source]}
                label={VEHICLE_SOURCE_LABELS[vehicule.source]}
                size="sm"
              />
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-button hover:bg-surface transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Photos */}
        <div className="px-6 pt-6">
          {selectedPhoto ? (
            <div className="rounded-card overflow-hidden bg-surface aspect-[16/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPhoto}
                alt={`${vehicule.marque} ${vehicule.modele}`}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="rounded-card bg-surface aspect-[16/9] flex items-center justify-center text-muted">
              Aucune photo
            </div>
          )}
          {photos.length > 1 && (
            <div className="flex gap-2 mt-3">
              {photos.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setPhotoIndex(i)}
                  className={`w-20 h-14 rounded-card overflow-hidden border-2 transition-colors ${
                    i === photoIndex ? 'border-foreground' : 'border-transparent hover:border-border'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Prix */}
        <div className="px-6 mt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="px-4 py-3 rounded-card bg-surface">
              <p className="text-[11px] text-muted uppercase tracking-wide">Prix d&apos;achat (DZD)</p>
              <p className="text-lg font-bold mt-0.5">
                {vehicule.prix_achat_dzd > 0 ? formatMontant(vehicule.prix_achat_dzd) : '—'}
              </p>
            </div>
            <div className="px-4 py-3 rounded-card bg-surface">
              <p className="text-[11px] text-muted uppercase tracking-wide">Prix d&apos;achat (CNY)</p>
              <p className="text-lg font-bold mt-0.5">
                {vehicule.prix_achat_cny > 0 ? formatOffrePrix(vehicule.prix_achat_cny, 'CNY') : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Caractéristiques */}
        <div className="px-6 py-6">
          <h4 className="section-title mb-3">Caractéristiques</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {specs.map((s) => (
              <SpecRow key={s.label} label={s.label} value={s.value} />
            ))}
          </div>

          <h4 className="section-title mt-6 mb-3">Options</h4>
          {vehicule.options && vehicule.options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {vehicule.options.map((o) => (
                <span key={o} className="px-3 py-1.5 text-xs font-medium rounded-full bg-surface text-foreground">
                  {o}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}

          <h4 className="section-title mt-6 mb-3">Équipements</h4>
          {vehicule.equipements && vehicule.equipements.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {vehicule.equipements.map((e) => (
                <span key={e} className="px-3 py-1.5 text-xs font-medium rounded-full bg-status-blue-bg text-status-blue-text">
                  {e}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}

          <div className="mt-6 pt-4 border-t border-border text-sm text-muted space-y-1">
            <p>Fournisseur : {vehicule.fournisseur_nom || '—'}</p>
            <p>Ajouté le {formatDate(vehicule.date_ajout)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}