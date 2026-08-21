'use client';

import { X, Building2, MapPin, Phone, Mail, Clock, CreditCard, Users, ExternalLink, Edit, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/constants';
import { vehicules } from '@/lib/mockData';
import { StatusBadge } from '@/components';
import type { Fournisseur } from '@/types';

interface FournisseurDetailModalProps {
  fournisseur: Fournisseur;
  onClose: () => void;
  onEdit: (f: Fournisseur) => void;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-card border border-border">
      <Icon className="w-4 h-4 text-muted mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default function FournisseurDetailModal({ fournisseur, onClose, onEdit }: FournisseurDetailModalProps) {
  const vehiculesAssocies = vehicules.filter((v) => v.fournisseur_id === fournisseur.id);

  const stats = {
    total: vehiculesAssocies.length,
    disponible: vehiculesAssocies.filter((v) => v.statut === 'disponible').length,
    reserve: vehiculesAssocies.filter((v) => v.statut === 'reserve').length,
    en_transit: vehiculesAssocies.filter((v) => v.statut === 'en_mer' || v.statut === 'en_douane').length,
    vendu: vehiculesAssocies.filter((v) => v.statut === 'vendu' || v.statut === 'livre').length,
  };

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
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-status-blue-bg flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-status-blue-text" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{fournisseur.nom}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge
                    variant={fournisseur.actif ? 'green' : 'gray'}
                    label={fournisseur.actif ? 'Actif' : 'Inactif'}
                    size="sm"
                  />
                  <span className="text-sm text-muted">
                    {fournisseur.pays} · {fournisseur.ville}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(fournisseur)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-button hover:bg-surface transition-colors flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Modifier
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-button hover:bg-surface transition-colors shrink-0"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="px-6 pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="px-4 py-3 rounded-card bg-surface text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-[11px] text-muted mt-1">Total véhicules</p>
            </div>
            <div className="px-4 py-3 rounded-card bg-status-green-bg text-center">
              <p className="text-2xl font-bold text-status-green-text">{stats.disponible}</p>
              <p className="text-[11px] text-muted mt-1">Disponibles</p>
            </div>
            <div className="px-4 py-3 rounded-card bg-status-amber-bg text-center">
              <p className="text-2xl font-bold text-status-amber-text">{stats.reserve + stats.en_transit}</p>
              <p className="text-[11px] text-muted mt-1">En cours</p>
            </div>
            <div className="px-4 py-3 rounded-card bg-status-blue-bg text-center">
              <p className="text-2xl font-bold text-status-blue-text">{stats.vendu}</p>
              <p className="text-[11px] text-muted mt-1">Vendus / Livrés</p>
            </div>
          </div>
        </div>

        {/* Info générale */}
        <div className="px-6 py-6">
          <h4 className="section-title mb-3">Informations générales</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <InfoRow icon={Users} label="Contact principal" value={fournisseur.contact || '—'} />
            <InfoRow icon={Phone} label="Téléphone" value={fournisseur.telephone || '—'} />
            <InfoRow icon={Mail} label="Email" value={fournisseur.email || '—'} />
            <InfoRow icon={MapPin} label="Adresse" value={fournisseur.adresse || '—'} />
            {fournisseur.site_web && (
              <InfoRow icon={ExternalLink} label="Site web" value={fournisseur.site_web} />
            )}
            <InfoRow icon={Clock} label="Délai de livraison" value={fournisseur.delai_livraison_jours ? `${fournisseur.delai_livraison_jours} jours` : '—'} />
            {fournisseur.conditions_paiement && (
              <InfoRow icon={CreditCard} label="Conditions de paiement" value={fournisseur.conditions_paiement} />
            )}
            {fournisseur.date_creation && (
              <InfoRow icon={Clock} label="Fournisseur depuis" value={formatDate(fournisseur.date_creation)} />
            )}
          </div>

          {/* Spécialités */}
          {fournisseur.specialites && fournisseur.specialites.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] text-muted uppercase tracking-wide mb-2">Spécialités</p>
              <div className="flex flex-wrap gap-2">
                {fournisseur.specialites.map((s) => (
                  <span
                    key={s}
                    className="px-3 py-1.5 text-xs font-medium rounded-full bg-status-blue-bg text-status-blue-text"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Note interne */}
          {fournisseur.note_interne && (
            <div className="mt-4 px-4 py-3 rounded-card bg-status-amber-bg border border-status-amber-text/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-status-amber-text mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted uppercase tracking-wide">Note interne</p>
                  <p className="text-sm mt-0.5">{fournisseur.note_interne}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Véhicules associés */}
        <div className="px-6 pb-6">
          <h4 className="section-title mb-3">
            Véhicules associés ({vehiculesAssocies.length})
          </h4>
          {vehiculesAssocies.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">
              Aucun véhicule associé à ce fournisseur
            </div>
          ) : (
            <div className="space-y-3">
              {vehiculesAssocies.slice(0, 5).map((v) => (
                <div key={v.id} className="flex items-center gap-4 p-3 rounded-card border border-border hover:bg-surface transition-colors">
                  <div className="w-16 h-12 rounded-lg bg-surface overflow-hidden shrink-0">
                    {v.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.photos[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                        <Building2 className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {v.marque} {v.modele} {v.annee}
                    </p>
                    <p className="text-xs text-muted">{v.couleur} · {v.kilometrage?.toLocaleString('fr-FR') ?? '0'} km</p>
                  </div>
                  <StatusBadge
                    variant={
                      v.statut === 'disponible' ? 'green' :
                      v.statut === 'vendu' || v.statut === 'livre' ? 'gray' :
                      v.statut === 'en_mer' || v.statut === 'en_douane' ? 'blue' : 'amber'
                    }
                    label={
                      v.statut === 'disponible' ? 'Disponible' :
                      v.statut === 'reserve' ? 'Réservé' :
                      v.statut === 'en_mer' ? 'En mer' :
                      v.statut === 'en_douane' ? 'En douane' :
                      v.statut === 'vendu' ? 'Vendu' :
                      v.statut === 'livre' ? 'Livré' : v.statut
                    }
                    size="sm"
                  />
                </div>
              ))}
              {vehiculesAssocies.length > 5 && (
                <p className="text-center text-sm text-muted">
                  + {vehiculesAssocies.length - 5} autre{vehiculesAssocies.length - 5 > 1 ? 's' : ''} véhicule{vehiculesAssocies.length - 5 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}