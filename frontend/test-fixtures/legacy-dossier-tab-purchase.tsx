import { StatusBadge } from '@/components';
import {
  STATUT_PAIEMENT_LABELS,
  STATUT_PAIEMENT_VARIANTS,
  formatDate,
  formatMontantDevise,
} from '@/lib/constants';
import { getFournisseurById, getUtilisateurById } from '@/lib/mockData';
import type { Dossier } from '@/types';

interface TabPurchaseProps {
  dossier: Dossier;
}

export default function DossierTabPurchase({ dossier }: TabPurchaseProps) {
  const purchase = dossier.purchase;

  if (!purchase) {
    return (
      <div className="card">
        <h3 className="section-title">Achat / fournisseur</h3>
        <p className="text-sm text-muted">
          Aucun achat associé à ce dossier (véhicule externe ou achat non initié).
        </p>
      </div>
    );
  }

  const fournisseur = getFournisseurById(purchase.supplier_id);
  const responsableChine = getUtilisateurById(purchase.responsable_chine_id);

  return (
    <div className="space-y-6">
      {/* Achat */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h3 className="section-title mb-0">Achat — {purchase.id}</h3>
          <StatusBadge
            variant={STATUT_PAIEMENT_VARIANTS[purchase.statut_paiement]}
            label={STATUT_PAIEMENT_LABELS[purchase.statut_paiement]}
            size="sm"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="field-label">Fournisseur</p>
            <p className="field-value">{fournisseur?.nom ?? dossier.fournisseur_nom ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">Montant total</p>
            <p className="field-value">
              {formatMontantDevise(purchase.montant, purchase.devise)}
            </p>
          </div>
          <div>
            <p className="field-label">Acompte fournisseur</p>
            <p className="field-value">
              {formatMontantDevise(purchase.acompte_fournisseur, purchase.devise)}
            </p>
          </div>
          <div>
            <p className="field-label">Solde fournisseur</p>
            <p className="field-value">
              {formatMontantDevise(purchase.solde_fournisseur, purchase.devise)}
            </p>
          </div>
          <div>
            <p className="field-label">Échéance</p>
            <p className="field-value">
              {purchase.date_echeance ? formatDate(purchase.date_echeance) : '—'}
            </p>
          </div>
          <div>
            <p className="field-label">Responsable Chine</p>
            <p className="field-value">
              {responsableChine
                ? `${responsableChine.prenom} ${responsableChine.nom}`
                : '—'}
            </p>
          </div>
        </div>
        {purchase.conditions_negociees && (
          <div className="mt-4 p-3 rounded-card border border-border bg-surface">
            <p className="field-label mb-1">Conditions négociées</p>
            <p className="text-sm text-foreground">{purchase.conditions_negociees}</p>
          </div>
        )}
      </div>

      {/* Documents fournisseur */}
      {purchase.documents.length > 0 && (
        <div className="card">
          <h3 className="section-title">Documents liés à l&apos;achat</h3>
          <ul className="space-y-1.5">
            {purchase.documents.map((doc) => (
              <li key={doc} className="text-sm text-foreground">
                • {doc}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
