'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Topbar, StatusBadge } from '@/components';
import { DOSSIER_TYPE_LABELS, DOSSIER_TYPE_VARIANTS, formatOffrePrix } from '@/lib/constants';
import {
  clients,
  offres,
  utilisateurs,
  getOffreById,
  createDossier,
  createClient,
  vehiculeDepuisOffre,
  vehiculeExterne,
} from '@/lib/mockData';
import type { TypeDossier } from '@/types';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Ship,
  PackageSearch,
  Truck,
  Trash2,
  FilePlus2,
} from 'lucide-react';

interface ExternalVehicleInput {
  marque: string;
  modele: string;
  annee: string;
  vin: string;
}

interface NewClientInput {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  numero_passeport: string;
  adresse: string;
}

const EMPTY_EXTERNAL: ExternalVehicleInput = { marque: '', modele: '', annee: '', vin: '' };

const EMPTY_NEW_CLIENT: NewClientInput = {
  nom: '',
  prenom: '',
  telephone: '',
  email: '',
  numero_passeport: '',
  adresse: '',
};

const TYPE_OPTIONS: {
  key: TypeDossier;
  icon: typeof Ship;
  description: string;
}[] = [
  {
    key: 'cif',
    icon: PackageSearch,
    description: 'Véhicule livré au port d\u2019Alger. Le client gère douane et transport local.',
  },
  {
    key: 'ddp',
    icon: Truck,
    description: 'Livraison clé en main : douane et transport local gérés par nous.',
  },
  {
    key: 'shipping_only',
    icon: Ship,
    description: 'Nous gérons uniquement le fret d\u2019un véhicule déjà acheté par le client.',
  },
];

const STEPS = [
  { key: 'type', label: 'Type de dossier' },
  { key: 'client', label: 'Client' },
  { key: 'vehicules', label: 'Véhicules' },
  { key: 'equipe', label: 'Équipe' },
  { key: 'recap', label: 'Récapitulatif' },
];

function CreerDossierContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preOffreId = searchParams.get('offre');

  const [step, setStep] = useState(0);
  const [type, setType] = useState<TypeDossier | null>(preOffreId ? 'cif' : null);
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [clientId, setClientId] = useState('');
  const [newClient, setNewClient] = useState<NewClientInput>(EMPTY_NEW_CLIENT);
  const [offreIds, setOffreIds] = useState<string[]>(preOffreId ? [preOffreId] : []);
  const [externalVehicles, setExternalVehicles] = useState<ExternalVehicleInput[]>([]);
  const [externalInput, setExternalInput] = useState<ExternalVehicleInput>(EMPTY_EXTERNAL);
  const [responsableChineId, setResponsableChineId] = useState('usr-003');
  const [responsableAlgerieId, setResponsableAlgerieId] = useState('usr-002');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const selectedOffres = offreIds
    .map((id) => getOffreById(id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));
  const vehicles = [
    ...selectedOffres.map(vehiculeDepuisOffre),
    ...externalVehicles.map((v) =>
      vehiculeExterne({
        marque: v.marque,
        modele: v.modele,
        annee: parseInt(v.annee, 10) || new Date().getFullYear(),
        vin: v.vin,
      }),
    ),
  ];
  const fournisseurNom = vehicles[0]?.fournisseur_nom ?? null;

  const responsablesChine = utilisateurs.filter(
    (u) => u.actif && (u.role === 'operations_chine' || u.role === 'super_admin'),
  );
  const responsablesAlgerie = utilisateurs.filter(
    (u) => u.actif && (u.role === 'sales_algerie' || u.role === 'super_admin'),
  );

  const canContinue = () => {
    if (step === 0) return type !== null;
    if (step === 1) {
      return clientMode === 'existing'
        ? clientId !== ''
        : newClient.nom.trim() !== '' && newClient.prenom.trim() !== '';
    }
    if (step === 2) return vehicles.length > 0;
    return true;
  };

  const handleContinue = () => {
    if (!canContinue()) {
      setError(
        step === 0
          ? 'Choisissez un type de dossier.'
          : step === 1
            ? 'Sélectionnez un client existant ou renseignez un nouveau client.'
            : 'Ajoutez au moins un véhicule.',
      );
      return;
    }
    setError('');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleCreate = () => {
    if (type === null) return;
    const finalClientId =
      clientMode === 'new' ? createClient(newClient).id : clientId;
    const dossier = createDossier({
      type,
      clientId: finalClientId,
      responsableChineId: type === 'shipping_only' ? null : responsableChineId,
      responsableAlgerieId,
      vehicles,
      offreIds,
      note,
    });
    router.push(`/dossiers/${dossier.id}`);
  };

  const toggleOffre = (offreId: string) => {
    setOffreIds((prev) =>
      prev.includes(offreId) ? prev.filter((id) => id !== offreId) : [...prev, offreId],
    );
  };

  const addExternalVehicle = () => {
    if (!externalInput.marque.trim() || !externalInput.modele.trim()) {
      setError('Marque et modèle sont requis pour un véhicule externe.');
      return;
    }
    setExternalVehicles((prev) => [...prev, externalInput]);
    setExternalInput(EMPTY_EXTERNAL);
    setError('');
  };

  const removeExternalVehicle = (index: number) => {
    setExternalVehicles((prev) => prev.filter((_, i) => i !== index));
  };

  const client = clients.find((c) => c.id === clientId);
  const clientNom =
    clientMode === 'new'
      ? newClient.prenom.trim() || newClient.nom.trim()
        ? `${newClient.prenom} ${newClient.nom}`.trim()
        : '—'
      : client
        ? `${client.prenom} ${client.nom}`
        : '—';

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">
      {/* Stepper */}
      <div className="flex items-center gap-2 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                i < step
                  ? 'bg-status-green-bg text-status-green-text'
                  : i === step
                    ? 'bg-foreground text-white'
                    : 'bg-surface text-muted border border-border'
              }`}
            >
              {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={`text-sm whitespace-nowrap ${
                i === step ? 'font-semibold text-foreground' : 'text-muted'
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        ))}
      </div>

      <div className="card">
        {/* Step 0 — Type */}
        {step === 0 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-status-blue-bg flex items-center justify-center shrink-0">
                <FilePlus2 className="w-5 h-5 text-status-blue-text" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Type de dossier</h3>
                <p className="text-sm text-muted">Choisissez le type d&apos;importation</p>
              </div>
            </div>
            <div className="space-y-3">
              {TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = type === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => setType(option.key)}
                    className={`w-full text-left flex items-start gap-4 p-4 rounded-card border transition-colors ${
                      selected
                        ? 'border-foreground bg-surface'
                        : 'border-border hover:border-border hover:bg-surface'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        selected ? 'bg-foreground text-white' : 'bg-status-blue-bg text-status-blue-text'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{DOSSIER_TYPE_LABELS[option.key]}</span>
                        <StatusBadge
                          variant={DOSSIER_TYPE_VARIANTS[option.key]}
                          label={DOSSIER_TYPE_LABELS[option.key]}
                          size="sm"
                        />
                      </div>
                      <p className="text-sm text-muted mt-1">{option.description}</p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 shrink-0 mt-1 ${
                        selected ? 'border-foreground bg-foreground' : 'border-border'
                      }`}
                    >
                      {selected && <Check className="w-4 h-4 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1 — Client */}
        {step === 1 && (
          <div>
            <h3 className="text-lg font-semibold mb-1">Client</h3>
            <p className="text-sm text-muted mb-5">
              Choisissez un client existant ou créez-en un nouveau
            </p>

            <div className="flex gap-3 mb-5">
              <button
                onClick={() => {
                  setClientMode('existing');
                  setError('');
                }}
                className={`px-4 py-2 text-sm font-medium rounded-button border transition-colors ${
                  clientMode === 'existing'
                    ? 'bg-foreground text-white border-foreground'
                    : 'border-border hover:bg-surface'
                }`}
              >
                Client existant
              </button>
              <button
                onClick={() => {
                  setClientMode('new');
                  setError('');
                }}
                className={`px-4 py-2 text-sm font-medium rounded-button border transition-colors ${
                  clientMode === 'new'
                    ? 'bg-foreground text-white border-foreground'
                    : 'border-border hover:bg-surface'
                }`}
              >
                Nouveau client
              </button>
            </div>

            {clientMode === 'existing' ? (
              <div>
                <p className="field-label mb-1">Client</p>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                >
                  <option value="">— Sélectionner un client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.prenom} {c.nom} — {c.telephone}
                    </option>
                  ))}
                </select>
                {client && (
                  <div className="mt-4 p-4 rounded-card border border-border bg-surface">
                    <p className="field-label">Détails client</p>
                    <p className="text-sm">
                      {client.prenom} {client.nom} · {client.telephone} · {client.email}
                    </p>
                    <p className="text-sm text-muted">
                      Passeport : {client.numero_passeport} · {client.nombre_dossiers} dossier(s)
                      existant(s)
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="field-label mb-1">Prénom *</p>
                  <input
                    value={newClient.prenom}
                    onChange={(e) => setNewClient({ ...newClient, prenom: e.target.value })}
                    placeholder="Prénom du client"
                    className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                </div>
                <div>
                  <p className="field-label mb-1">Nom *</p>
                  <input
                    value={newClient.nom}
                    onChange={(e) => setNewClient({ ...newClient, nom: e.target.value })}
                    placeholder="Nom du client"
                    className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                </div>
                <div>
                  <p className="field-label mb-1">Téléphone</p>
                  <input
                    value={newClient.telephone}
                    onChange={(e) => setNewClient({ ...newClient, telephone: e.target.value })}
                    placeholder="+213 …"
                    className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                </div>
                <div>
                  <p className="field-label mb-1">Email</p>
                  <input
                    value={newClient.email}
                    onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                    placeholder="client@email.dz"
                    className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                </div>
                <div>
                  <p className="field-label mb-1">Numéro de passeport</p>
                  <input
                    value={newClient.numero_passeport}
                    onChange={(e) =>
                      setNewClient({ ...newClient, numero_passeport: e.target.value })
                    }
                    placeholder="C-0000000"
                    className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                </div>
                <div>
                  <p className="field-label mb-1">Adresse</p>
                  <input
                    value={newClient.adresse}
                    onChange={(e) => setNewClient({ ...newClient, adresse: e.target.value })}
                    placeholder="Alger, Hydra"
                    className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2 — Véhicules */}
        {step === 2 && (
          <div>
            <h3 className="text-lg font-semibold mb-1">Véhicules</h3>
            <p className="text-sm text-muted mb-5">
              {type === 'shipping_only'
                ? 'Renseignez le véhicule externe du client'
                : 'Sélectionnez une ou plusieurs offres Chine'}
            </p>

            {type !== 'shipping_only' && (
              <>
                <p className="field-label mb-2">Offres disponibles</p>
                <div className="space-y-2 mb-6">
                  {offres
                    .filter((o) => o.statut === 'disponible' || offreIds.includes(o.id))
                    .map((offre) => {
                      const selected = offreIds.includes(offre.id);
                      return (
                        <button
                          key={offre.id}
                          onClick={() => toggleOffre(offre.id)}
                          className={`w-full text-left flex items-center justify-between gap-4 p-3 rounded-card border transition-colors ${
                            selected ? 'border-foreground bg-surface' : 'border-border hover:bg-surface'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-status-blue-bg flex items-center justify-center shrink-0">
                              <PackageSearch className="w-4 h-4 text-status-blue-text" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {offre.marque} {offre.modele} {offre.annee}
                              </p>
                              <p className="text-xs text-muted">
                                {offre.fournisseur_nom} · {offre.type} · {offre.kilometrage.toLocaleString('fr-FR')} km
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold">
                              CIF {formatOffrePrix(offre.prix_cif, offre.devise)}
                            </p>
                            <p className="text-xs text-muted">
                              DDP {formatOffrePrix(offre.prix_ddp, offre.devise)}
                            </p>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                              selected ? 'border-foreground bg-foreground' : 'border-border'
                            }`}
                          >
                            {selected && <Check className="w-4 h-4 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </>
            )}

            {type === 'shipping_only' && (
              <>
                <p className="field-label mb-2">Ajouter un véhicule externe</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                  <input
                    value={externalInput.marque}
                    onChange={(e) => setExternalInput({ ...externalInput, marque: e.target.value })}
                    placeholder="Marque"
                    className="px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                  <input
                    value={externalInput.modele}
                    onChange={(e) => setExternalInput({ ...externalInput, modele: e.target.value })}
                    placeholder="Modèle"
                    className="px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                  <input
                    value={externalInput.annee}
                    onChange={(e) => setExternalInput({ ...externalInput, annee: e.target.value })}
                    placeholder="Année"
                    className="px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                  <button
                    onClick={addExternalVehicle}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-button hover:bg-surface transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter
                  </button>
                </div>
                <input
                  value={externalInput.vin}
                  onChange={(e) => setExternalInput({ ...externalInput, vin: e.target.value })}
                  placeholder="VIN (optionnel)"
                  className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text mb-4"
                />
              </>
            )}

            {/* Véhicules sélectionnés */}
            {vehicles.length > 0 && (
              <div>
                <p className="field-label mb-2">
                  Véhicules du dossier ({vehicles.length})
                </p>
                <div className="space-y-2">
                  {vehicles.map((vehicle, index) => {
                    const external = vehicle.source === 'external';
                    return (
                      <div
                        key={vehicle.id}
                        className="flex items-center justify-between gap-4 p-3 rounded-card border border-border bg-surface"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusBadge
                            variant={external ? 'gray' : 'blue'}
                            label={external ? 'Externe' : 'Offre'}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {vehicle.marque} {vehicle.modele} {vehicle.annee}
                            </p>
                            <p className="text-xs text-muted truncate">
                              {vehicle.fournisseur_nom}
                              {vehicle.vin && ` · ${vehicle.vin}`}
                            </p>
                          </div>
                        </div>
                        {external && (
                          <button
                            onClick={() => removeExternalVehicle(index - selectedOffres.length)}
                            className="text-status-red-text hover:opacity-70 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Équipe */}
        {step === 3 && (
          <div>
            <h3 className="text-lg font-semibold mb-1">Équipe & notes</h3>
            <p className="text-sm text-muted mb-5">Responsables du dossier sur chaque site</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <p className="field-label mb-1">Responsable Chine</p>
                <select
                  value={responsableChineId}
                  onChange={(e) => setResponsableChineId(e.target.value)}
                  disabled={type === 'shipping_only'}
                  className="w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-1 focus:ring-status-blue-text disabled:opacity-50"
                >
                  {responsablesChine.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.prenom} {u.nom} — {u.role === 'super_admin' ? 'Admin' : 'Ops Chine'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="field-label mb-1">Responsable Algérie</p>
                <select
                  value={responsableAlgerieId}
                  onChange={(e) => setResponsableAlgerieId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                >
                  {responsablesAlgerie.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.prenom} {u.nom} — {u.role === 'super_admin' ? 'Admin' : 'Sales Algérie'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <p className="field-label mb-1">Note interne (optionnel)</p>
              <textarea
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex. : le client souhaite une livraison rapide…"
                className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 4 — Récapitulatif */}
        {step === 4 && (
          <div>
            <h3 className="text-lg font-semibold mb-5">Récapitulatif</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-card border border-border bg-surface">
                  <p className="field-label">Type de dossier</p>
                  <div className="mt-1">
                    {type && (
                      <StatusBadge
                        variant={DOSSIER_TYPE_VARIANTS[type]}
                        label={DOSSIER_TYPE_LABELS[type]}
                      />
                    )}
                  </div>
                </div>
                <div className="p-4 rounded-card border border-border bg-surface">
                  <p className="field-label">Client</p>
                  <p className="text-sm font-medium">{clientNom}</p>
                </div>
                <div className="p-4 rounded-card border border-border bg-surface">
                  <p className="field-label">Fournisseur</p>
                  <p className="text-sm font-medium">{fournisseurNom ?? '—'}</p>
                </div>
                <div className="p-4 rounded-card border border-border bg-surface">
                  <p className="field-label">Véhicules</p>
                  <p className="text-sm font-medium">{vehicles.length}</p>
                </div>
              </div>

              <div className="p-4 rounded-card border border-border bg-surface">
                <p className="field-label mb-2">Véhicules</p>
                <ul className="space-y-1">
                  {vehicles.map((v) => (
                    <li key={v.id} className="text-sm">
                      • {v.marque} {v.modele} {v.annee} — {v.fournisseur_nom}
                    </li>
                  ))}
                </ul>
              </div>

              {type && type !== 'shipping_only' && (
                <div className="p-4 rounded-card border border-border bg-surface">
                  <p className="field-label mb-2">Équipe</p>
                  <p className="text-sm">
                    Responsable Chine :{' '}
                    <span className="font-medium">
                      {responsablesChine.find((u) => u.id === responsableChineId)?.prenom ?? '—'}{' '}
                      {responsablesChine.find((u) => u.id === responsableChineId)?.nom ?? ''}
                    </span>
                  </p>
                  <p className="text-sm mt-1">
                    Responsable Algérie :{' '}
                    <span className="font-medium">
                      {responsablesAlgerie.find((u) => u.id === responsableAlgerieId)?.prenom ?? '—'}{' '}
                      {responsablesAlgerie.find((u) => u.id === responsableAlgerieId)?.nom ?? ''}
                    </span>
                  </p>
                </div>
              )}

              {note && (
                <div className="p-4 rounded-card border border-border bg-surface">
                  <p className="field-label mb-1">Note interne</p>
                  <p className="text-sm">{note}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Erreur */}
        {error && (
          <p className="mt-4 text-sm font-medium text-status-red-text">{error}</p>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
          <button
            onClick={() => {
              setError('');
              setStep((s) => Math.max(s - 1, 0));
            }}
            disabled={step === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-button hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Précédent
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={handleContinue}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
            >
              Continuer
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
            >
              <FilePlus2 className="w-4 h-4" />
              Créer le dossier
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreerDossierPage() {
  return (
    <>
      <Topbar title="Nouveau dossier" subtitle="Création d'un dossier d'importation" />
      <Suspense fallback={<div className="p-8 text-sm text-muted">Chargement…</div>}>
        <CreerDossierContent />
      </Suspense>
    </>
  );
}
