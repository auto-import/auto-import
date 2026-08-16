'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar, StatusBadge, Stepper, Tabs } from '@/components';
import { getDossierById } from '@/lib/mockData';
import {
  DOSSIER_STATUTS,
  DOSSIER_STATUT_LABELS,
  DOSSIER_STATUT_VARIANTS,
  DOSSIER_TABS,
} from '@/lib/constants';
import DossierTabClient from './tabs/TabClient';
import DossierTabVehicule from './tabs/TabVehicule';
import DossierTabPaiements from './tabs/TabPaiements';
import DossierTabDocuments from './tabs/TabDocuments';
import DossierTabShipping from './tabs/TabShipping';
import DossierTabDouane from './tabs/TabDouane';
import DossierTabHistorique from './tabs/TabHistorique';

interface DossierDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function DossierDetailPage({ params }: DossierDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const dossier = getDossierById(id);
  const [activeTab, setActiveTab] = useState('client');

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

  const currentStepIndex = DOSSIER_STATUTS.indexOf(dossier.statut);
  const stepLabels = DOSSIER_STATUTS.map((s) => DOSSIER_STATUT_LABELS[s]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'client':
        return <DossierTabClient dossier={dossier} />;
      case 'vehicule':
        return <DossierTabVehicule dossier={dossier} />;
      case 'paiements':
        return <DossierTabPaiements dossier={dossier} />;
      case 'documents':
        return <DossierTabDocuments dossier={dossier} />;
      case 'shipping':
        return <DossierTabShipping dossier={dossier} />;
      case 'douane':
        return <DossierTabDouane dossier={dossier} />;
      case 'historique':
        return <DossierTabHistorique dossier={dossier} />;
      default:
        return null;
    }
  };

  return (
    <>
      <Topbar
        title="Dossier d'importation"
        subtitle={`${dossier.reference} · ${dossier.client_nom}${dossier.vehicule_desc ? ` · ${dossier.vehicule_desc}` : ''}`}
      />
      <div className="p-8 space-y-6">
        {/* Header card */}
        <div className="card">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold">{dossier.reference}</h2>
                <StatusBadge
                  variant={DOSSIER_STATUT_VARIANTS[dossier.statut]}
                  label={DOSSIER_STATUT_LABELS[dossier.statut]}
                />
              </div>
              <p className="text-sm text-muted">
                Client : {dossier.client_nom}
                {dossier.vehicule_desc && ` · Véhicule : ${dossier.vehicule_desc}`}
                {dossier.fournisseur_nom && ` · Fournisseur : ${dossier.fournisseur_nom}`}
              </p>
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
