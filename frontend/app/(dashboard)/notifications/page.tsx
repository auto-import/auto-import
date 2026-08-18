'use client';

import { useState } from 'react';
import { Topbar, Tabs } from '@/components';
import { Bell, Check, AlertTriangle, Plus, Power, PowerOff } from 'lucide-react';
import { formatDate } from '@/lib/constants';
import { ROLE_LABELS } from '@/lib/constants';
import {
  getNotificationsUtilisateur,
  getTypesNotification,
  getTypeNotificationById,
  marquerNotificationLue,
  marquerToutesNotificationsLues,
  createTypeNotification,
  setTypeNotificationActif,
  UTILISATEUR_COURANT_ID,
} from '@/lib/mockData';
import type { TypeNotification, NiveauNotification } from '@/types';

const ICON_MAP: Record<NiveauNotification, React.ReactNode> = {
  info: <Bell className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
  success: <Check className="w-5 h-5" />,
};

const BG_MAP: Record<NiveauNotification, string> = {
  info: 'bg-status-blue-bg text-status-blue-text',
  warning: 'bg-status-amber-bg text-status-amber-text',
  success: 'bg-status-green-bg text-status-green-text',
};

const NIVEAU_LABELS: Record<NiveauNotification, string> = {
  info: 'Info',
  warning: 'Alerte',
  success: 'Succès',
};

const TABS = [
  { key: 'inbox', label: 'Mes notifications' },
  { key: 'types', label: 'Types de notifications' },
];

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [, setRefresh] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [description, setDescription] = useState('');
  const [niveau, setNiveau] = useState<NiveauNotification>('info');
  const [destinataires, setDestinataires] = useState<string[]>([]);
  const [formError, setFormError] = useState('');

  const notifications = getNotificationsUtilisateur(UTILISATEUR_COURANT_ID);
  const nonLues = notifications.filter((n) => !n.lu);
  const types = getTypesNotification();

  const toggleDestinataire = (role: string) => {
    setDestinataires((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleCreateType = () => {
    if (!libelle.trim()) {
      setFormError('Le libellé est obligatoire.');
      return;
    }
    if (destinataires.length === 0) {
      setFormError('Sélectionnez au moins un rôle destinataire.');
      return;
    }
    const code = libelle
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    createTypeNotification({
      code: code || `type_${Date.now()}`,
      libelle: libelle.trim(),
      description: description.trim() || 'Type de notification ajouté manuellement.',
      niveau,
      actif: true,
      destinataires: destinataires as TypeNotification['destinataires'],
    });
    setLibelle('');
    setDescription('');
    setNiveau('info');
    setDestinataires([]);
    setFormError('');
    setShowForm(false);
    setRefresh((v) => v + 1);
  };

  const renderInbox = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {nonLues.length} notification{nonLues.length !== 1 ? 's' : ''} non
          lue{nonLues.length !== 1 ? 's' : ''}
        </p>
        {nonLues.length > 0 && (
          <button
            onClick={() => {
              marquerToutesNotificationsLues(UTILISATEUR_COURANT_ID);
              setRefresh((v) => v + 1);
            }}
            className="px-4 py-2 text-sm font-medium border border-border rounded-button hover:bg-surface transition-colors"
          >
            Tout marquer comme lu
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          Aucune notification pour le moment.
        </div>
      ) : (
        notifications.map((notif) => {
          const type = getTypeNotificationById(notif.type_id);
          return (
            <div
              key={notif.id}
              onClick={() => {
                if (!notif.lu) {
                  marquerNotificationLue(notif.id);
                  setRefresh((v) => v + 1);
                }
              }}
              className={`card flex items-start gap-4 cursor-pointer transition-colors ${
                !notif.lu ? 'border-s-4 border-s-foreground' : 'hover:bg-surface'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  BG_MAP[type?.niveau ?? 'info']
                }`}
              >
                {ICON_MAP[type?.niveau ?? 'info']}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <h4 className="text-sm font-semibold truncate">{notif.titre}</h4>
                    {type && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface text-muted shrink-0">
                        {type.libelle}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted shrink-0">{formatDate(notif.date)}</span>
                </div>
                <p className="text-sm text-muted mt-0.5">{notif.message}</p>
              </div>
              {!notif.lu && (
                <div className="w-2.5 h-2.5 rounded-full bg-status-blue-text mt-1 shrink-0" />
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const renderTypes = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {types.length} type{types.length !== 1 ? 's' : ''} de notification configuré
          {types.length !== 1 ? 's' : ''} ·{' '}
          {types.filter((t) => t.actif).length} actif{types.filter((t) => t.actif).length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            setFormError('');
          }}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Nouveau type
        </button>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="section-title">Ajouter un type de notification au système</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="field-label mb-1">Libellé *</p>
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Ex : Contrat signé"
                className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text"
              />
            </div>
            <div>
              <p className="field-label mb-1">Niveau</p>
              <select
                value={niveau}
                onChange={(e) => setNiveau(e.target.value as NiveauNotification)}
                className="w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-1 focus:ring-status-blue-text"
              >
                <option value="info">Info</option>
                <option value="warning">Alerte</option>
                <option value="success">Succès</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <p className="field-label mb-1">Description</p>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Quand cette notification doit-elle être envoyée ?"
                className="w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text resize-none"
              />
            </div>
            <div className="md:col-span-2">
              <p className="field-label mb-1">Destinataires (rôles) *</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <button
                    key={role}
                    onClick={() => toggleDestinataire(role)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      destinataires.includes(role)
                        ? 'bg-foreground text-white border-foreground'
                        : 'border-border hover:bg-surface'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {formError && <p className="text-sm text-status-red-text">{formError}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateType}
              className="px-5 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
            >
              Ajouter le type
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setFormError('');
              }}
              className="px-5 py-2 text-sm font-medium border border-border rounded-button hover:bg-background transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start">
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted uppercase">Type</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted uppercase">Destinataires</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted uppercase">Statut</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-muted uppercase">Actif</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        t.actif ? BG_MAP[t.niveau] : 'bg-surface text-muted'
                      }`}
                    >
                      {ICON_MAP[t.niveau]}
                    </div>
                    <div>
                      <p className="font-medium">{t.libelle}</p>
                      <p className="text-xs text-muted mt-0.5 max-w-md">{t.description}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {t.destinataires.map((r) => (
                      <span
                        key={r}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-surface text-muted"
                      >
                        {ROLE_LABELS[r]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      t.actif
                        ? 'bg-status-green-bg text-status-green-text'
                        : 'bg-surface text-muted'
                    }`}
                  >
                    {NIVEAU_LABELS[t.niveau]}
                  </span>
                </td>
                <td className="px-4 py-3 text-end">
                  <button
                    onClick={() => {
                      setTypeNotificationActif(t.id, !t.actif);
                      setRefresh((v) => v + 1);
                    }}
                    title={t.actif ? 'Désactiver' : 'Activer'}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-button border transition-colors ${
                      t.actif
                        ? 'border-border text-foreground hover:bg-surface'
                        : 'border-border text-muted hover:bg-surface'
                    }`}
                  >
                    {t.actif ? (
                      <>
                        <Power className="w-3.5 h-3.5" /> Actif
                      </>
                    ) : (
                      <>
                        <PowerOff className="w-3.5 h-3.5" /> Inactif
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <Topbar title="Notifications" subtitle="Centre de notifications et types configurés" />
      <div className="p-8">
        <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="mt-6">{activeTab === 'inbox' ? renderInbox() : renderTypes()}</div>
      </div>
    </>
  );
}