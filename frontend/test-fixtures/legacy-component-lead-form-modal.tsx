'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { createLead, utilisateurs } from '@/lib/mockData';
import { LEAD_SOURCE_LABELS } from '@/lib/constants';
import type { TypeDossier, Devise, SourceLead } from '@/types';

interface LeadFormModalProps {
  onClose: () => void;
  onSaved: () => void;
}

const inputCls = 'w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text';
const labelCls = 'field-label mb-1';

export default function LeadFormModal({ onClose, onSaved }: LeadFormModalProps) {
  const [form, setForm] = useState({
    nom: '',
    prenom: '',
    telephone: '',
    whatsapp: '',
    email: '',
    ville: '',
    source: 'facebook' as SourceLead,
    type_dossier_attendu: 'cif' as TypeDossier,
    vehicule_interet: '',
    valeur_attendue: '',
    devise_attendue: 'USD' as Devise,
    assigne_a: utilisateurs[0]?.id ?? '',
    notes: '',
  });
  const [error, setError] = useState('');

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    if (!form.nom.trim()) {
      setError('Le nom est obligatoire.');
      return;
    }
    if (!form.prenom.trim()) {
      setError('Le prénom est obligatoire.');
      return;
    }
    if (!form.telephone.trim()) {
      setError('Le téléphone est obligatoire.');
      return;
    }

    createLead({
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      telephone: form.telephone.trim(),
      whatsapp: form.whatsapp.trim() || undefined,
      email: form.email.trim() || undefined,
      ville: form.ville.trim() || undefined,
      source: form.source,
      type_dossier_attendu: form.type_dossier_attendu,
      vehicule_interet: form.vehicule_interet.trim() || undefined,
      valeur_attendue: form.valeur_attendue ? Number(form.valeur_attendue) : undefined,
      devise_attendue: form.devise_attendue,
      assigne_a: form.assigne_a,
      notes: form.notes.trim() || undefined,
    });

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
            <h3 className="text-xl font-bold">Nouveau lead</h3>
            <p className="text-sm text-muted mt-0.5">Renseignez les informations du prospect</p>
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
          <div>
            <h4 className="section-title mb-3">Contact</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className={labelCls}>Nom *</p>
                <input
                  value={form.nom}
                  onChange={(e) => set('nom', e.target.value)}
                  placeholder="Boudiaf"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Prénom *</p>
                <input
                  value={form.prenom}
                  onChange={(e) => set('prenom', e.target.value)}
                  placeholder="Rachid"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Téléphone *</p>
                <input
                  value={form.telephone}
                  onChange={(e) => set('telephone', e.target.value)}
                  placeholder="+213 661 111 222"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>WhatsApp</p>
                <input
                  value={form.whatsapp}
                  onChange={(e) => set('whatsapp', e.target.value)}
                  placeholder="+213 661 111 222"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Email</p>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="r.boudiaf@gmail.com"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Ville</p>
                <input
                  value={form.ville}
                  onChange={(e) => set('ville', e.target.value)}
                  placeholder="Alger"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="section-title mb-3">Commercial</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className={labelCls}>Source</p>
                <select
                  value={form.source}
                  onChange={(e) => set('source', e.target.value)}
                  className={inputCls}
                >
                  {(Object.keys(LEAD_SOURCE_LABELS) as SourceLead[]).map((key) => (
                    <option key={key} value={key}>
                      {LEAD_SOURCE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>Type dossier attendu</p>
                <select
                  value={form.type_dossier_attendu}
                  onChange={(e) => set('type_dossier_attendu', e.target.value)}
                  className={inputCls}
                >
                  <option value="cif">CIF</option>
                  <option value="ddp">DDP</option>
                  <option value="shipping_only">Expédition seule</option>
                </select>
              </div>
              <div>
                <p className={labelCls}>Véhicule d&apos;intérêt</p>
                <input
                  value={form.vehicule_interet}
                  onChange={(e) => set('vehicule_interet', e.target.value)}
                  placeholder="BYD Seal"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Valeur attendue</p>
                <input
                  type="number"
                  value={form.valeur_attendue}
                  onChange={(e) => set('valeur_attendue', e.target.value)}
                  placeholder="25000"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Devise</p>
                <select
                  value={form.devise_attendue}
                  onChange={(e) => set('devise_attendue', e.target.value)}
                  className={inputCls}
                >
                  <option value="USD">USD</option>
                  <option value="DZD">DZD</option>
                  <option value="CNY">CNY</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <p className={labelCls}>Assigné à</p>
                <select
                  value={form.assigne_a}
                  onChange={(e) => set('assigne_a', e.target.value)}
                  className={inputCls}
                >
                  {utilisateurs.filter((u) => u.actif).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.prenom} {u.nom}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <h4 className="section-title mb-3">Notes</h4>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Notes sur le prospect..."
              className={`${inputCls} resize-none`}
            />
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
              Ajouter le lead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
