'use client';

import { useRef, useState } from 'react';
import { DOSSIER_STATUTS_BY_TYPE, DOSSIER_STATUT_LABELS, getPreuveRequise, etapeRequiertPreuve } from '@/lib/constants';
import { uploadPreuveDossier } from '@/lib/mockData';
import type { Dossier, Preuve, StatutDossier } from '@/types';
import { AlertTriangle, Camera, CheckCircle2, Upload, Video, ImageIcon } from 'lucide-react';

interface TabPreuvesProps {
  dossier: Dossier;
  onChange?: () => void;
}

function formatTaille(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(size / 1024))} Ko`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DossierTabPreuves({ dossier, onChange }: TabPreuvesProps) {
  const [, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [etape, setEtape] = useState<StatutDossier>(dossier.statut);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preuves = dossier.preuves ?? [];
  const preuveRequise = getPreuveRequise(dossier.statut);
  const aPreuveCourante = preuves.some((p) => p.etape === dossier.statut);

  const etapesGatees = DOSSIER_STATUTS_BY_TYPE[dossier.type].filter(etapeRequiertPreuve);
  const etapesAvecPreuves = etapesGatees.filter((s) => preuves.some((p) => p.etape === s));

  const triggerUpload = (etapeCible: StatutDossier) => {
    setEtape(etapeCible);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFilesChosen = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setBusy(true);
    for (const file of files) {
      const type = file.type.startsWith('video/') ? 'video' : 'photo';
      let url = '#';
      if (type === 'photo') {
        try {
          url = await readAsDataUrl(file);
        } catch {
          url = '#';
        }
      }
      uploadPreuveDossier(dossier.id, {
        etape,
        type,
        nom: file.name,
        url,
        taille: formatTaille(file.size),
      });
    }
    setBusy(false);
    setRefresh((v) => v + 1);
    onChange?.();
  };

  const renderMiniature = (p: Preuve) => {
    if (p.type === 'photo' && p.url && p.url.startsWith('data:')) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={p.url} alt={p.nom} className="w-full h-full object-cover" />;
    }
    return (
      <div className="w-full h-full bg-surface flex items-center justify-center text-muted">
        {p.type === 'video' ? <Video className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Statut actuel */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-muted">Étape actuelle</p>
            <h3 className="section-title mt-1 mb-1">{DOSSIER_STATUT_LABELS[dossier.statut]}</h3>
            {preuveRequise ? (
              <p className="text-sm text-muted">Preuve requise : {preuveRequise}</p>
            ) : (
              <p className="text-sm text-muted">
                Cette étape ne nécessite pas de preuve photo/vidéo.
              </p>
            )}
          </div>
          {preuveRequise &&
            (aPreuveCourante ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-button bg-status-green-bg text-status-green-text text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Preuve fournie
              </div>
            ) : (
              <button
                onClick={() => triggerUpload(dossier.statut)}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {busy ? 'Envoi…' : 'Ajouter des photos / vidéos'}
              </button>
            ))}
        </div>

        {preuveRequise && !aPreuveCourante && (
          <div className="mt-4 px-4 py-3 rounded-card bg-status-amber-bg border border-status-amber-text/30 text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-status-amber-text shrink-0" />
            <span>
              Le statut ne pourra pas avancer tant que la preuve pour «{' '}
              {DOSSIER_STATUT_LABELS[dossier.statut]} » n&apos;est pas uploadée.
            </span>
          </div>
        )}
      </div>

      {/* Checklist des étapes physiques */}
      <div className="card p-5">
        <h3 className="section-title mb-3">Preuves par étape ({etapesGatees.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {etapesGatees.map((s) => {
            const aPreuve = preuves.some((p) => p.etape === s);
            const estCourante = s === dossier.statut;
            return (
              <div
                key={s}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-card border border-border"
              >
                <span className="text-sm font-medium">{DOSSIER_STATUT_LABELS[s]}</span>
                {aPreuve ? (
                  <span className="text-xs font-medium text-status-green-text flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Fournie
                  </span>
                ) : estCourante ? (
                  <button
                    onClick={() => triggerUpload(s)}
                    className="text-xs font-medium text-status-blue-text hover:underline flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    À fournir
                  </button>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Galerie */}
      <div className="card p-5">
        <h3 className="section-title mb-3">
          Photos & vidéos uploadées ({preuves.length})
        </h3>
        {preuves.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune photo ou vidéo pour le moment. Utilisez le bouton ci-dessus pour ajouter une
            preuve de l&apos;étape actuelle.
          </p>
        ) : (
          <div className="space-y-5">
            {etapesAvecPreuves.map((s) => {
              const items = preuves.filter((p) => p.etape === s);
              return (
                <div key={s}>
                  <p className="text-sm font-semibold mb-2">
                    {DOSSIER_STATUT_LABELS[s]}
                    <span className="text-xs text-muted font-normal ms-2">
                      {items.length} fichier{items.length > 1 ? 's' : ''}
                    </span>
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {items.map((p) => (
                      <div key={p.id} className="rounded-card overflow-hidden border border-border">
                        <div className="aspect-[4/3]">{renderMiniature(p)}</div>
                        <div className="p-2.5">
                          <p className="text-xs font-medium truncate" title={p.nom}>
                            {p.nom}
                          </p>
                          <p className="text-[11px] text-muted mt-0.5">
                            {p.type === 'photo' ? (
                              <span className="inline-flex items-center gap-1">
                                <Camera className="w-3 h-3" /> Photo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Video className="w-3 h-3" /> Vidéo
                              </span>
                            )}
                            {' · '}
                            {p.taille}
                          </p>
                          <p className="text-[11px] text-muted mt-0.5">
                            {p.upload_par} · {p.date}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFilesChosen(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}