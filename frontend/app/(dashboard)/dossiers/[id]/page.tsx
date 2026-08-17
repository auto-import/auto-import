'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar, StatusBadge, Stepper, Tabs } from '@/components';
import { getDossierById, getOffreById, getUtilisateurById } from '@/lib/mockData';
import {
  DOSSIER_STATUT_LABELS,
  DOSSIER_STATUT_VARIANTS,
  DOSSIER_STATUTS_BY_TYPE,
  DOSSIER_TYPE_LABELS,
  DOSSIER_TYPE_VARIANTS,
  DOSSIER_TABS,
  dossierVehiculesSummary,
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

interface DossierDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function DossierDetailPage({ params }: DossierDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const dossier = getDossierById(id);
  const [activeTab, setActiveTab] = useState('overview');

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
        return <DossierTabDocuments dossier={dossier} />;
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
              <button className="px-4 py-2 text-sm font-medium border border-border rounded-button hover:bg-surface transition-colors">
                Modifier
              </button>
              <button className="px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity">
                Avancer le statut
              </button>
            </div>
          </div>

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