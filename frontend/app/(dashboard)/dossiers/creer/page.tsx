'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components';
import { getOffreById } from '@/lib/mockData';
import { FilePlus2 } from 'lucide-react';

function CreerDossierContent() {
  const searchParams = useSearchParams();
  const offreId = searchParams.get('offre');
  const offre = offreId ? getOffreById(offreId) : undefined;

  return (
    <div className="p-8">
      <div className="card max-w-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-status-blue-bg flex items-center justify-center shrink-0">
            <FilePlus2 className="w-5 h-5 text-status-blue-text" />
          </div>
          <h3 className="text-lg font-semibold">Création de dossier</h3>
        </div>
        <p className="text-sm text-muted">
          La création de dossier à partir d&apos;une offre arrive bientôt.
        </p>
        {offre && (
          <p className="mt-3 text-sm">
            Offre sélectionnée :{' '}
            <span className="font-medium">
              {offre.marque} {offre.modele} {offre.annee}
            </span>{' '}
            ({offre.fournisseur_nom})
          </p>
        )}
        <Link
          href="/offres"
          className="inline-flex items-center mt-5 text-sm font-medium text-status-blue-text hover:underline"
        >
          ← Retour aux offres
        </Link>
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