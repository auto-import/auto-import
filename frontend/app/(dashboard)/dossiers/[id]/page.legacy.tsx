'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileWarning } from 'lucide-react';
import { Topbar, StatusBadge, Stepper, Tabs } from '@/components';
import {
  clients,
  utilisateurs,
  getDossierById,
  getOffreById,
  getClientById,
  getUtilisateurById,
  avancerStatutDossier,
  updateDossier,
  addNoteDossier,
  aContratSigneValide,
  aPreuveEtape,
} from '@/lib/mockData';
import {
  DOSSIER_STATUT_LABELS,
  DOSSIER_STATUT_VARIANTS,
  DOSSIER_STATUTS_BY_TYPE,
  DOSSIER_TYPE_LABELS,
  DOSSIER_TYPE_VARIANTS,
  DOSSIER_TABS,
  dossierVehiculesSummary,
  getPreuveRequise,
} from '@/lib/constants';
import DossierTabOverview from './tabs/TabOverview';
import DossierTabClient from './tabs/TabClient';
import DossierTabVehicules from './tabs/TabVehicules';
import DossierTabPurchase from './tabs/TabPurchase';
import DossierTabShipping from './tabs/TabShipping';
import DossierTabFinance from './tabs/TabFinance';
import DossierTabDocuments from './tabs/TabDocuments';
import DossierTabTasks from './tabs/TabTasks';
import DossierTabTimeline from './tabs/TabTimeline';
import DossierTabNotes from './tabs/TabNotes';
import DossierTabPreuves from './tabs/TabPreuves';

interface DossierDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function DossierDetailPage({ params }: DossierDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const dossier = getDossierById(id);
  const [activeTab, setActiveTab] = useState('overview');
  const [, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editClientId, setEditClientId] = useState('');
  const [editResChine, setEditResChine] = useState('');
  const [editResAlgerie, setEditResAlgerie] = useState('');
  const [editFournisseur, setEditFournisseur] = useState('');
  const [editNote, setEditNote] = useState('');
  const [actionError, setActionError] = useState('');

  if (!dossier) {
    return (
      <>
        <Topbar title="Dossier introuvable" />
        <div className="p-8">
          <p className="text-muted text-sm">Ce dossier n&apos;existe pas.</p>
          <button
            onClick={() => router.push('/dossiers')}
            className="mt-4 text-sm font-medium text-status-blue-text hover:underline"
          >
            ← Retour aux dossiers
          </button>
        </div>
      </>
    );
  }

  const steps = DOSSIER_STATUTS_BY_TYPE[dossier.type];
  const currentStepIndex = steps.indexOf(dossier.statut);
  const stepLabels = steps.map((s) => DOSSIER_STATUT_LABELS[s]);
  const isLastStep = currentStepIndex === steps.length - 1;

  const responsablesChine = utilisateurs.filter(
    (u) => u.actif && (u.role === 'operations_chine' || u.role === 'super_admin'),
  );
  const responsablesAlgerie = utilisateurs.filter(
    (u) => u.actif && (u.role === 'sales_algerie' || u.role === 'super_admin'),
  );

  const handleAvancerStatut = () => {
    const result = avancerStatutDossier(dossier.id);
    if (!result.ok) {
      setActionError(result.message ?? 'Action impossible.');
    } else {
      setActionError('');
    }
    setRefresh((v) => v + 1);
  };

  const openEdit = () => {
    setEditClientId(dossier.client_id);
    setEditResChine(dossier.responsable_chine_id ?? '');
    setEditResAlgerie(dossier.responsable_algerie_id ?? '');
    setEditFournisseur(dossier.fournisseur_nom ?? '');
    setEditNote('');
    setEditing(true);
  };

  const handleSaveEdit = () => {
    const client = getClientById(editClientId);
    updateDossier(
      dossier.id,
      {
        client_id: editClientId,
        client_nom: client ? `${client.prenom.charAt(0)}. ${client.nom}` : dossier.client_nom,
        client,
        responsable_chine_id: editResChine || null,
        responsable_algerie_id: editResAlgerie || null,
        fournisseur_nom: editFournisseur.trim() || null,
      },
      { log: 'Informations modifiées (client, responsables, fournisseur)' },
    );
    if (editNote.trim()) addNoteDossier(dossier.id, editNote.trim());
    setEditing(false);
    setRefresh((v) => v + 1);
  };

  const responsableChine = dossier.responsable_chine_id
    ? getUtilisateurById(dossier.responsable_chine_id)
    : undefined;
  const responsableAlgerie = dossier.responsable_algerie_id
    ? getUtilisateurById(dossier.responsable_algerie_id)
    : undefined;
  const offre = dossier.offre_id ? getOffreById(dossier.offre_id) : undefined;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <DossierTabOverview dossier={dossier} />;
      case 'client':
        return <DossierTabClient dossier={dossier} />;
      case 'vehicles':
        return <DossierTabVehicules dossier={dossier} />;
      case 'purchase':
        return <DossierTabPurchase dossier={dossier} />;
      case 'shipping':
        return <DossierTabShipping dossier={dossier} />;
      case 'finance':
        return <DossierTabFinance dossier={dossier} />;
      case 'documents':
        return (
          <DossierTabDocuments dossier={dossier} onChange={() => setRefresh((v) => v + 1)} />
        );
      case 'preuves':
        return (
          <DossierTabPreuves dossier={dossier} onChange={() => setRefresh((v) => v + 1)} />
        );
      case 'tasks':
        return <DossierTabTasks dossier={dossier} />;
      case 'timeline':
        return <DossierTabTimeline dossier={dossier} />;
      case 'notes':
        return <DossierTabNotes dossier={dossier} />;
      default:
        return null;
    }
  };

  return (
    <>
      <Topbar
        title="Dossier d'importation"
        subtitle={`${dossier.reference} · ${dossier.client_nom} · ${dossierVehiculesSummary(dossier.vehicles)}`}
      />
      <div className="p-8 space-y-6">
        {/* Header card */}
        <div className="card">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h2 className="text-2xl font-bold">{dossier.reference}</h2>
                <StatusBadge
                  variant={DOSSIER_TYPE_VARIANTS[dossier.type]}
                  label={DOSSIER_TYPE_LABELS[dossier.type]}
                />
                <StatusBadge
                  variant={DOSSIER_STATUT_VARIANTS[dossier.statut]}
                  label={DOSSIER_STATUT_LABELS[dossier.statut]}
                />
                {offre && (
                  <StatusBadge
                    variant="blue"
                    label={`Offre · ${offre.marque} ${offre.modele}`}
                  />
                )}
              </div>
              <p className="text-sm text-muted">
                Client : {dossier.client_nom}
                {' · '}Véhicules : {dossierVehiculesSummary(dossier.vehicles)}
                {dossier.fournisseur_nom && ` · Fournisseur : ${dossier.fournisseur_nom}`}
              </p>
              <div className="flex items-center gap-4 mt-3 text-sm text-muted flex-wrap">
                <span>
                  Responsable Chine :{' '}
                  <span className="font-medium text-foreground">
                    {responsableChine
                      ? `${responsableChine.prenom} ${responsableChine.nom}`
                      : '—'}
                  </span>
                </span>
                <span>
                  Responsable Algérie :{' '}
                  <span className="font-medium text-foreground">
                    {responsableAlgerie
                      ? `${responsableAlgerie.prenom} ${responsableAlgerie.nom}`
                      : '—'}
                  </span>
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={openEdit}
                className="px-4 py-2 text-sm font-medium border border-border rounded-button hover:bg-surface transition-colors"
              >
                Modifier
              </button>
              <button
                onClick={handleAvancerStatut}
                disabled={isLastStep}
                title={isLastStep ? 'Statut final atteint' : 'Passer à l\u2019étape suivante'}
                className="px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLastStep ? 'Statut final' : 'Avancer le statut'}
              </button>
            </div>
          </div>

          {/* Error feedback */}
          {actionError && (
            <div className="mt-4 px-4 py-3 rounded-card bg-status-red-bg text-status-red-text text-sm">
              {actionError}
            </div>
          )}

          {/* Contrat requis */}
          {dossier.statut === 'contrat_signe' && !aContratSigneValide(dossier.id) && (
            <div className="mt-4 px-4 py-3 rounded-card bg-status-amber-bg border border-status-amber-text/30 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <FileWarning className="w-5 h-5 text-status-amber-text shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Contrat signé requis</p>
                  <p className="text-sm text-muted">
                    Uploadez le PDF du contrat signé et scanné par le client pour débloquer
                    l&apos;avancement du statut.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveTab('documents');
                  setActionError('');
                }}
                className="px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity shrink-0"
              >
                Uploadez le contrat
              </button>
            </div>
          )}

          {/* Preuve requise */}
          {getPreuveRequise(dossier.statut) &&
            !aPreuveEtape(dossier.id, dossier.statut) && (
              <div className="mt-4 px-4 py-3 rounded-card bg-status-amber-bg border border-status-amber-text/30 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <FileWarning className="w-5 h-5 text-status-amber-text shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Preuve requise : {DOSSIER_STATUT_LABELS[dossier.statut]}
                    </p>
                    <p className="text-sm text-muted">
                      {getPreuveRequise(dossier.statut)} — à ajouter avant d&apos;avancer.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveTab('preuves');
                    setActionError('');
                  }}
                  className="px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity shrink-0"
                >
                  Ajouter photos / vidéos
                </button>
              </div>
            )}

          {/* Edit panel */}
          {editing && (
            <div className="mt-6 p-5 rounded-card border border-border bg-surface">
              <h3 className="section-title">Modifier le dossier</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="field-label mb-1">Client</p>
                  <select
                    value={editClientId}
                    onChange={(e) => setEditClientId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.prenom} {c.nom} — {c.telephone}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="field-label mb-1">Fournisseur</p>
                  <input
                    value={editFournisseur}
                    onChange={(e) => setEditFournisseur(e.target.value)}
                    placeholder="Nom du fournisseur"
                    className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  />
                </div>
                <div>
                  <p className="field-label mb-1">Responsable Chine</p>
                  <select
                    value={editResChine}
                    onChange={(e) => setEditResChine(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  >
                    <option value="">—</option>
                    {responsablesChine.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.prenom} {u.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="field-label mb-1">Responsable Algérie</p>
                  <select
                    value={editResAlgerie}
                    onChange={(e) => setEditResAlgerie(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-1 focus:ring-status-blue-text"
                  >
                    <option value="">—</option>
                    {responsablesAlgerie.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.prenom} {u.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <p className="field-label mb-1">Note interne</p>
                  <textarea
                    rows={2}
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Ajouter une note (facultatif)"
                    className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text resize-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSaveEdit}
                  className="px-5 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
                >
                  Enregistrer
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-5 py-2 text-sm font-medium border border-border rounded-button hover:bg-background transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Stepper */}
          <div className="mt-6">
            <Stepper steps={stepLabels} currentIndex={currentStepIndex} />
          </div>

          {/* Tabs */}
          <Tabs tabs={DOSSIER_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Tab content */}
        <div>{renderTabContent()}</div>
      </div>
    </>
  );
}