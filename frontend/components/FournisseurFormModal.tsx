'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { createFournisseur, aFournisseurExiste } from '@/lib/mockData';
import type { Fournisseur } from '@/types';

interface FournisseurFormModalProps {
  onClose: () => void;
  onSaved: () => void;
  initialData?: Fournisseur | null;
}

const inputCls = 'w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text';
const labelCls = 'field-label mb-1';

export default function FournisseurFormModal({ onClose, onSaved, initialData }: FournisseurFormModalProps) {
  const [form, setForm] = useState({
    nom: initialData?.nom || '',
    pays: initialData?.pays || 'Chine',
    ville: initialData?.ville || '',
    contact: initialData?.contact || '',
    email: initialData?.email || '',
    telephone: initialData?.telephone || '',
    adresse: initialData?.adresse || '',
    site_web: initialData?.site_web || '',
    delai_livraison_jours: initialData?.delai_livraison_jours?.toString() || '',
    conditions_paiement: initialData?.conditions_paiement || '',
    specialites: initialData?.specialites?.join(', ') || '',
    note_interne: initialData?.note_interne || '',
  });
  const [error, setError] = useState('');

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    if (!form.nom.trim()) {
      setError('Le nom est obligatoire.');
      return;
    }
    if (!initialData && aFournisseurExiste(form.nom.trim())) {
      setError('Un fournisseur avec ce nom existe déjà.');
      return;
    }

    const specialites = form.specialites
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (initialData) {
      // Update existing
      Object.assign(initialData, {
        nom: form.nom.trim(),
        pays: form.pays.trim(),
        ville: form.ville.trim(),
        contact: form.contact.trim(),
        email: form.email.trim(),
        telephone: form.telephone.trim(),
        adresse: form.adresse.trim() || undefined,
        site_web: form.site_web.trim() || undefined,
        delai_livraison_jours: form.delai_livraison_jours ? Number(form.delai_livraison_jours) : undefined,
        conditions_paiement: form.conditions_paiement.trim() || undefined,
        specialites: specialites.length > 0 ? specialites : undefined,
        note_interne: form.note_interne.trim() || undefined,
      });
    } else {
      // Create new
      createFournisseur({
        nom: form.nom.trim(),
        pays: form.pays.trim(),
        ville: form.ville.trim(),
        contact: form.contact.trim(),
        email: form.email.trim(),
        telephone: form.telephone.trim(),
        adresse: form.adresse.trim() || undefined,
        site_web: form.site_web.trim() || undefined,
        delai_livraison_jours: form.delai_livraison_jours ? Number(form.delai_livraison_jours) : undefined,
        conditions_paiement: form.conditions_paiement.trim() || undefined,
        specialites: specialites.length > 0 ? specialites : undefined,
        note_interne: form.note_interne.trim() || undefined,
      });
    }
    onSaved();
    onClose();
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
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-6 py-4 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">
              {initialData ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}
            </h3>
            <p className="text-sm text-muted mt-0.5">
              {initialData ? 'Mettez à jour les informations' : 'Renseignez les informations du fournisseur'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-button hover:bg-surface transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Identification */}
          <div>
            <h4 className="section-title mb-3">Identification</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className={labelCls}>Nom *</p>
                <input
                  value={form.nom}
                  onChange={(e) => set('nom', e.target.value)}
                  placeholder="Sino Auto Ltd"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Pays</p>
                <input
                  value={form.pays}
                  onChange={(e) => set('pays', e.target.value)}
                  placeholder="Chine"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Ville</p>
                <input
                  value={form.ville}
                  onChange={(e) => set('ville', e.target.value)}
                  placeholder="Shanghai"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Adresse</p>
                <input
                  value={form.adresse}
                  onChange={(e) => set('adresse', e.target.value)}
                  placeholder="128 Zhongshan Road"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="section-title mb-3">Contact</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className={labelCls}>Contact principal</p>
                <input
                  value={form.contact}
                  onChange={(e) => set('contact', e.target.value)}
                  placeholder="Li Wei"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Email</p>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="liwei@sinoauto.cn"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Téléphone</p>
                <input
                  value={form.telephone}
                  onChange={(e) => set('telephone', e.target.value)}
                  placeholder="+86 21 5555 1234"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Site web</p>
                <input
                  value={form.site_web}
                  onChange={(e) => set('site_web', e.target.value)}
                  placeholder="https://sinoauto.cn"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Conditions commerciales */}
          <div>
            <h4 className="section-title mb-3">Conditions commerciales</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className={labelCls}>Délai de livraison (jours)</p>
                <input
                  type="number"
                  value={form.delai_livraison_jours}
                  onChange={(e) => set('delai_livraison_jours', e.target.value)}
                  placeholder="14"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Conditions de paiement</p>
                <input
                  value={form.conditions_paiement}
                  onChange={(e) => set('conditions_paiement', e.target.value)}
                  placeholder="30% à la commande, 70% avant expédition"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Spécialités */}
          <div>
            <h4 className="section-title mb-3">Spécialités & notes</h4>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <p className={labelCls}>Spécialités (séparées par des virgules)</p>
                <input
                  value={form.specialites}
                  onChange={(e) => set('specialites', e.target.value)}
                  placeholder="BMW, Mercedes-Benz, SUV"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Note interne</p>
                <textarea
                  rows={3}
                  value={form.note_interne}
                  onChange={(e) => set('note_interne', e.target.value)}
                  placeholder="Partenaire historique, fiable sur les délais..."
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-status-red-text">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium border border-border rounded-button hover:bg-background transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
            >
              {initialData ? 'Enregistrer' : 'Ajouter le fournisseur'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}