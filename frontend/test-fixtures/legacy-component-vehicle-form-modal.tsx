'use client';

import { useRef, useState } from 'react';
import { X, Upload } from 'lucide-react';
import { fournisseurs } from '@/lib/mockData';
import { createVehicule } from '@/lib/mockData';
import {
  CARBURANT_LABELS,
  BOITE_LABELS,
  DIRECTION_LABELS,
  CARROSSERIE_LABELS,
  VEHICLE_SOURCE_LABELS,
} from '@/lib/constants';
import type {
  EtatVehicule,
  TypeCarrosserie,
  Carburant,
  BoiteVitesse,
  Direction,
  SourceVehicule,
} from '@/types';

interface VehiculeFormModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text';
const labelCls = 'field-label mb-1';

export default function VehiculeFormModal({ onClose, onCreated }: VehiculeFormModalProps) {
  const [form, setForm] = useState({
    marque: '',
    modele: '',
    annee: '',
    couleur: '',
    vin: '',
    etat: '' as '' | EtatVehicule,
    type_carrosserie: '' as '' | TypeCarrosserie,
    carburant: '' as '' | Carburant,
    boite: '' as '' | BoiteVitesse,
    motorisation: '',
    puissance_cv: '',
    cylindree_cc: '',
    kilometrage: '',
    portes: '',
    places: '',
    direction: '' as '' | Direction,
    couleur_interieur: '',
    prix_achat_cny: '',
    prix_achat_dzd: '',
    fournisseur_nom: '',
    source: 'offre' as SourceVehicule,
    garantie: '',
    options: '',
    equipements: '',
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handlePhotos = async (fileList: FileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setBusy(true);
    const urls: string[] = [];
    for (const file of files) {
      try {
        urls.push(await readAsDataUrl(file));
      } catch {
        // ignore unreadable file
      }
    }
    setPhotos((prev) => [...prev, ...urls]);
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = () => {
    if (!form.marque.trim() || !form.modele.trim()) {
      setError('La marque et le modèle sont obligatoires.');
      return;
    }
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
    createVehicule({
      marque: form.marque.trim(),
      modele: form.modele.trim(),
      annee: num(form.annee) ?? new Date().getFullYear(),
      couleur: form.couleur.trim(),
      vin: form.vin.trim(),
      etat: form.etat || undefined,
      type_carrosserie: form.type_carrosserie || undefined,
      carburant: form.carburant || undefined,
      boite: form.boite || undefined,
      motorisation: form.motorisation.trim() || undefined,
      puissance_cv: num(form.puissance_cv),
      cylindree_cc: num(form.cylindree_cc),
      kilometrage: num(form.kilometrage),
      portes: num(form.portes),
      places: num(form.places),
      direction: form.direction || undefined,
      couleur_interieur: form.couleur_interieur.trim() || undefined,
      prix_achat_cny: num(form.prix_achat_cny) ?? 0,
      prix_achat_dzd: num(form.prix_achat_dzd) ?? 0,
      fournisseur_nom: form.fournisseur_nom.trim(),
      source: form.source,
      garantie: form.garantie.trim() || undefined,
      options: form.options
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      equipements: form.equipements
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      photos,
    });
    onCreated();
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
            <h3 className="text-xl font-bold">Ajouter un véhicule</h3>
            <p className="text-sm text-muted mt-0.5">
              Renseignez les caractéristiques du véhicule à ajouter au stock
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className={labelCls}>Marque *</p>
                <input
                  value={form.marque}
                  onChange={(e) => set('marque', e.target.value)}
                  placeholder="BMW"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Modèle *</p>
                <input
                  value={form.modele}
                  onChange={(e) => set('modele', e.target.value)}
                  placeholder="X5"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Année</p>
                <input
                  type="number"
                  value={form.annee}
                  onChange={(e) => set('annee', e.target.value)}
                  placeholder="2024"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>VIN</p>
                <input
                  value={form.vin}
                  onChange={(e) => set('vin', e.target.value)}
                  placeholder="WBAFG01010L191234"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Couleur extérieure</p>
                <input
                  value={form.couleur}
                  onChange={(e) => set('couleur', e.target.value)}
                  placeholder="Noir métallisé"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Fournisseur</p>
                <input
                  value={form.fournisseur_nom}
                  onChange={(e) => set('fournisseur_nom', e.target.value)}
                  list="fournisseurs-list"
                  placeholder="Sino Auto Ltd"
                  className={inputCls}
                />
                <datalist id="fournisseurs-list">
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.nom} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* Caractéristiques */}
          <div>
            <h4 className="section-title mb-3">Caractéristiques</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className={labelCls}>État</p>
                <select
                  value={form.etat}
                  onChange={(e) => set('etat', e.target.value as '' | EtatVehicule)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  <option value="neuf">Neuf</option>
                  <option value="occasion">Occasion</option>
                </select>
              </div>
              <div>
                <p className={labelCls}>Carrosserie</p>
                <select
                  value={form.type_carrosserie}
                  onChange={(e) => set('type_carrosserie', e.target.value as '' | TypeCarrosserie)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {Object.entries(CARROSSERIE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>Carburant</p>
                <select
                  value={form.carburant}
                  onChange={(e) => set('carburant', e.target.value as '' | Carburant)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {Object.entries(CARBURANT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>Boîte de vitesses</p>
                <select
                  value={form.boite}
                  onChange={(e) => set('boite', e.target.value as '' | BoiteVitesse)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {Object.entries(BOITE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>Motorisation</p>
                <input
                  value={form.motorisation}
                  onChange={(e) => set('motorisation', e.target.value)}
                  placeholder="3.0L Turbo 6 cylindres"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Puissance (ch)</p>
                <input
                  type="number"
                  value={form.puissance_cv}
                  onChange={(e) => set('puissance_cv', e.target.value)}
                  placeholder="286"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Cylindrée (cm³)</p>
                <input
                  type="number"
                  value={form.cylindree_cc}
                  onChange={(e) => set('cylindree_cc', e.target.value)}
                  placeholder="2998"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Kilométrage (km)</p>
                <input
                  type="number"
                  value={form.kilometrage}
                  onChange={(e) => set('kilometrage', e.target.value)}
                  placeholder="42000"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Portes</p>
                <input
                  type="number"
                  value={form.portes}
                  onChange={(e) => set('portes', e.target.value)}
                  placeholder="5"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Places</p>
                <input
                  type="number"
                  value={form.places}
                  onChange={(e) => set('places', e.target.value)}
                  placeholder="5"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Direction</p>
                <select
                  value={form.direction}
                  onChange={(e) => set('direction', e.target.value as '' | Direction)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {Object.entries(DIRECTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>Intérieur</p>
                <input
                  value={form.couleur_interieur}
                  onChange={(e) => set('couleur_interieur', e.target.value)}
                  placeholder="Cuir noir"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Garantie</p>
                <input
                  value={form.garantie}
                  onChange={(e) => set('garantie', e.target.value)}
                  placeholder="24 mois"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Prix & origine */}
          <div>
            <h4 className="section-title mb-3">Prix & origine</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className={labelCls}>Prix achat (DA)</p>
                <input
                  type="number"
                  value={form.prix_achat_dzd}
                  onChange={(e) => set('prix_achat_dzd', e.target.value)}
                  placeholder="6500000"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Prix achat (CNY)</p>
                <input
                  type="number"
                  value={form.prix_achat_cny}
                  onChange={(e) => set('prix_achat_cny', e.target.value)}
                  placeholder="350000"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Source</p>
                <select
                  value={form.source}
                  onChange={(e) => set('source', e.target.value as SourceVehicule)}
                  className={inputCls}
                >
                  {Object.entries(VEHICLE_SOURCE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Options / équipements */}
          <div>
            <h4 className="section-title mb-3">Options & équipements</h4>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <p className={labelCls}>Options (séparées par des virgules)</p>
                <input
                  value={form.options}
                  onChange={(e) => set('options', e.target.value)}
                  placeholder="Cuir Nappa, Toit ouvrant, Sièges ventilés"
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>Équipements (séparés par des virgules)</p>
                <input
                  value={form.equipements}
                  onChange={(e) => set('equipements', e.target.value)}
                  placeholder="Caméra 360°, Apple CarPlay, Jantes 21 pouces"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Photos */}
          <div>
            <h4 className="section-title mb-3">Photos ({photos.length})</h4>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="w-full px-4 py-6 text-sm border border-dashed border-border rounded-card text-muted hover:bg-surface transition-colors flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {busy ? 'Chargement…' : 'Choisir des photos (multiples)'}
            </button>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-24 h-20 rounded-card overflow-hidden border border-border group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 end-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Retirer la photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handlePhotos(e.target.files);
              }}
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
              Ajouter le véhicule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
