'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, ChevronDown, LogOut } from 'lucide-react';
import {
  getNotificationsNonLues,
  getNotificationsUtilisateur,
  marquerNotificationLue,
  marquerToutesNotificationsLues,
  utilisateurs,
} from '@/lib/mockData';
import { useAuth } from '@/components/AuthProvider';
import { ROLE_LABELS, formatDate } from '@/lib/constants';
import type { Notification } from '@/types';

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const { currentUser, switchUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [, setRefresh] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const nonLues = getNotificationsNonLues(currentUser.id);
  const recentes = getNotificationsUtilisateur(currentUser.id).slice(0, 6);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
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
                      marquerToutesNotificationsLues(currentUser.id);
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

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex items-center gap-2 p-1.5 rounded-button hover:bg-surface transition-colors"
          >
            <div className="w-9 h-9 bg-foreground rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-white">{currentUser.avatar_initials}</span>
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium leading-tight">{currentUser.prenom} {currentUser.nom}</p>
              <p className="text-[11px] text-muted">{ROLE_LABELS[currentUser.role]}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted hidden md:block" />
          </button>

          {userMenuOpen && (
            <div className="absolute end-0 top-full mt-2 w-72 card p-0 overflow-hidden shadow-lg">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">{currentUser.prenom} {currentUser.nom}</p>
                <p className="text-xs text-muted">{currentUser.email}</p>
                <p className="text-xs text-muted mt-0.5">{ROLE_LABELS[currentUser.role]}</p>
              </div>
              <div className="p-2 border-b border-border">
                <p className="px-2 py-1 text-[11px] text-muted uppercase tracking-wide font-medium">
                  Changer d&apos;utilisateur
                </p>
                {utilisateurs.filter((u) => u.actif).map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      switchUser(user.id);
                      setUserMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors ${
                      user.id === currentUser.id
                        ? 'bg-surface font-medium'
                        : 'hover:bg-surface'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-status-blue-bg flex items-center justify-center text-[10px] font-bold text-status-blue-text">
                      {user.avatar_initials}
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{user.prenom} {user.nom}</p>
                      <p className="text-[11px] text-muted">{ROLE_LABELS[user.role]}</p>
                    </div>
                    {user.id === currentUser.id && (
                      <span className="ms-auto text-status-green-text text-xs">●</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="p-2">
                <Link
                  href="/utilisateurs"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-2 py-2 text-sm text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Gestion utilisateurs
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}