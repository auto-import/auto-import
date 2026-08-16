'use client';

import { Topbar } from '@/components';
import { Bell, Check, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/constants';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success';
  title: string;
  message: string;
  date: string;
  read: boolean;
}

const notifications: Notification[] = [
  {
    id: 'notif-001',
    type: 'warning',
    title: 'Facture en retard',
    message: 'La facture FAC-2026-115 (Frais douane) est en retard de paiement.',
    date: '2026-08-15T10:00:00',
    read: false,
  },
  {
    id: 'notif-002',
    type: 'info',
    title: 'Arrivée prochaine',
    message: 'Le conteneur MSCU-1187-4 (MSC ZONDA) arrive le 22 Août à Alger.',
    date: '2026-08-14T15:30:00',
    read: false,
  },
  {
    id: 'notif-003',
    type: 'success',
    title: 'Dédouanement validé',
    message: 'Le dossier CA-2026-0012 a été dédouané avec succès.',
    date: '2026-08-10T09:00:00',
    read: true,
  },
  {
    id: 'notif-004',
    type: 'info',
    title: 'Nouveau dossier',
    message: 'Le dossier CA-2026-0060 a été créé pour B. Amrani (Audi Q7 2024).',
    date: '2026-08-14T11:00:00',
    read: true,
  },
  {
    id: 'notif-005',
    type: 'success',
    title: 'Paiement reçu',
    message: 'Acompte de 3 000 000 DA reçu pour le dossier CA-2026-0045.',
    date: '2026-07-01T14:00:00',
    read: true,
  },
];

const ICON_MAP = {
  info: <Bell className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
  success: <Check className="w-5 h-5" />,
};

const BG_MAP = {
  info: 'bg-status-blue-bg text-status-blue-text',
  warning: 'bg-status-amber-bg text-status-amber-text',
  success: 'bg-status-green-bg text-status-green-text',
};

export default function NotificationsPage() {
  return (
    <>
      <Topbar title="Notifications" subtitle="Centre de notifications" />
      <div className="p-8 space-y-4">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`card flex items-start gap-4 ${!notif.read ? 'border-s-4 border-s-foreground' : ''}`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${BG_MAP[notif.type]}`}>
              {ICON_MAP[notif.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4">
                <h4 className="text-sm font-semibold">{notif.title}</h4>
                <span className="text-xs text-muted shrink-0">{formatDate(notif.date)}</span>
              </div>
              <p className="text-sm text-muted mt-0.5">{notif.message}</p>
            </div>
            {!notif.read && (
              <div className="w-2.5 h-2.5 rounded-full bg-status-blue-text mt-1 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
