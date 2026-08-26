"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bell, CheckCheck, ChevronDown, LogOut, UserRound } from "lucide-react";
import { io } from "socket.io-client";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import { phase3Api, type ApiNotification } from "@/lib/phase3-api";
import { authApi, profileApi } from "@/lib/api";

export default function Topbar({
  title,
  subtitle,
  avatarUrlOverride,
}: {
  title: string;
  subtitle?: string;
  avatarUrlOverride?: string | null;
}) {
  const { currentUser, logout, hasPermission } = useAuth();
  const currentUserId = currentUser?.id;
  const canReadNotifications = hasPermission(Permission.NOTIFICATIONS_READ);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    if (!canReadNotifications) return;
    try {
      const page = await phase3Api.notifications.list({ limit: 6 });
      setNotifications(page.items);
      setUnread(page.unreadCount);
    } catch {
      /* Auth boundary owns session/API failures. */
    }
  }, [canReadNotifications]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  useEffect(() => {
    if (!canReadNotifications) return;
    const base = (
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api"
    ).replace(/\/api\/?$/, "");
    const socket = io(`${base}/notifications`, {
      transports: ["websocket"],
      auth: { token: authApi.accessToken() },
    });
    socket.on("notification.created", () => void load());
    return () => {
      socket.disconnect();
    };
  }, [canReadNotifications, load]);
  useEffect(() => {
    if (!currentUserId) return;
    let current: string | null = null;
    const applyBlob = (blob: Blob | null) => {
      if (!blob) {
        setAvatarUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return null;
        });
        return;
      }
      const next = URL.createObjectURL(blob);
      current = next;
      setAvatarUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return next;
      });
    };
    const refreshAvatar = async (event?: Event) => {
      try {
        if (event instanceof CustomEvent) {
          applyBlob(event.detail instanceof Blob ? event.detail : null);
          return;
        }
        const profile = await profileApi.get();
        if (!profile.avatarUrl) {
          applyBlob(null);
          return;
        }
        const blob = await profileApi.avatarBlob();
        applyBlob(blob);
      } catch {
        setAvatarUrl(null);
      }
    };
    const initial = window.setTimeout(() => void refreshAvatar(), 0);
    const retry = window.setTimeout(() => void refreshAvatar(), 1000);
    const avatarChanged = (event: Event) => void refreshAvatar(event);
    window.addEventListener("profile-avatar-changed", avatarChanged);
    return () => {
      window.clearTimeout(initial);
      window.clearTimeout(retry);
      window.removeEventListener("profile-avatar-changed", avatarChanged);
      if (current) URL.revokeObjectURL(current);
    };
  }, [currentUserId]);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!notificationRef.current?.contains(event.target as Node))
        setOpen(false);
      if (!userRef.current?.contains(event.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  const initials = currentUser
    ? `${currentUser.firstName[0] ?? ""}${currentUser.lastName[0] ?? ""}`.toUpperCase()
    : "";
  async function read(item: ApiNotification) {
    if (!item.readAt) await phase3Api.notifications.read(item.id);
    await load();
  }
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-4 sm:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {canReadNotifications && (
          <div ref={notificationRef} className="relative">
            <button
              aria-label="Notifications"
              onClick={() => setOpen((value) => !value)}
              className="relative rounded-lg p-2 hover:bg-surface"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </button>
            {open && (
              <div className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <strong className="text-sm">Notifications</strong>
                  {unread > 0 && (
                    <button
                      onClick={async () => {
                        await phase3Api.notifications.readAll();
                        await load();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Tout lire
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length ? (
                    notifications.map((item) => (
                      <Link
                        key={item.id}
                        href={item.entityUrl || "/notifications"}
                        onClick={() => void read(item)}
                        className={`block border-b border-border px-4 py-3 last:border-0 hover:bg-surface ${!item.readAt ? "bg-blue-50/40" : ""}`}
                      >
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted">
                          {item.content}
                        </p>
                      </Link>
                    ))
                  ) : (
                    <p className="p-6 text-center text-sm text-muted">
                      Aucune notification
                    </p>
                  )}
                </div>
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="block border-t border-border px-4 py-3 text-center text-sm font-semibold"
                >
                  Voir l’inbox
                </Link>
              </div>
            )}
          </div>
        )}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setUserOpen((value) => !value)}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-surface"
          >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-xs font-bold text-white">
              {avatarUrlOverride || avatarUrl ? (
                <Image
                  unoptimized
                  width={36}
                  height={36}
                  src={avatarUrlOverride || avatarUrl!}
                  alt="Avatar du profil"
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </span>
            <span className="hidden text-left md:block">
              <span className="block text-sm font-medium">
                {currentUser?.firstName} {currentUser?.lastName}
              </span>
              <span className="block text-[11px] text-muted">
                {currentUser?.roles[0]?.name ?? "Utilisateur"}
              </span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-muted md:block" />
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-white p-2 shadow-xl">
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-semibold">
                  {currentUser?.firstName} {currentUser?.lastName}
                </p>
                <p className="text-xs text-muted">{currentUser?.email}</p>
              </div>
              <Link
                href="/profil"
                onClick={() => setUserOpen(false)}
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface"
              >
                <UserRound className="h-4 w-4" />
                Mon profil
              </Link>
              <button
                onClick={() => void logout()}
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface"
              >
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
