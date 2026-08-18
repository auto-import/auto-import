'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import {
  getNotificationsNonLues,
  getNotificationsUtilisateur,
  marquerNotificationLue,
  marquerToutesNotificationsLues,
  UTILISATEUR_COURANT_ID,
} from '@/lib/mockData';
import { formatDate } from '@/lib/constants';
import type { Notification } from '@/types';

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const [open, setOpen] = useState(false);
  const [, setRefresh] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const nonLues = getNotificationsNonLues(UTILISATEUR_COURANT_ID);
  const recentes = getNotificationsUtilisateur(UTILISATEUR_COURANT_ID).slice(0, 6);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClickNotification = (n: Notification) => {
    if (!n.lu) {
      marquerNotificationLue(n.id);
      setRefresh((v) => v + 1);
    }
  };

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-border bg-background sticky top-0 z-10">
      <div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        {/* Notifications dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="relative p-2 rounded-button hover:bg-surface transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-foreground" />
            {nonLues.length > 0 && (
              <span className="absolute -top-1 -end-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-status-red-text text-white text-[10px] font-bold flex items-center justify-center">
                {nonLues.length}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute end-0 top-full mt-2 w-96 card p-0 overflow-hidden shadow-lg">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">
                  Notifications
                  {nonLues.length > 0 && (
                    <span className="text-xs text-muted font-normal ms-2">
                      {nonLues.length} non lue{nonLues.length > 1 ? 's' : ''}
                    </span>
                  )}
                </p>
                {nonLues.length > 0 && (
                  <button
                    onClick={() => {
                      marquerToutesNotificationsLues(UTILISATEUR_COURANT_ID);
                      setRefresh((v) => v + 1);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-status-blue-text hover:underline"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Tout marquer lu
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {recentes.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted">
                    Aucune notification
                  </p>
                ) : (
                  recentes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleClickNotification(n)}
                      className={`w-full text-start px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface transition-colors ${
                        !n.lu ? 'bg-surface/60' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">{n.titre}</span>
                        <span className="text-xs text-muted shrink-0">{formatDate(n.date)}</span>
                      </div>
                      <p className="text-sm text-muted mt-0.5 line-clamp-2">{n.message}</p>
                      {!n.lu && <div className="w-2 h-2 rounded-full bg-status-blue-text mt-1.5" />}
                    </button>
                  ))
                )}
              </div>

              <div className="px-4 py-3 border-t border-border">
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="text-sm font-medium text-status-blue-text hover:underline"
                >
                  Voir toutes les notifications
                </Link>
              </div>
            </div>
          )}
        </div>
        {/* User avatar */}
        <div className="w-9 h-9 bg-foreground rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-white">AD</span>
        </div>
      </div>
    </header>
  );
}