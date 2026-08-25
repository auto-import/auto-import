"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Permission } from "@/lib/api-contract";
import type { ApiPermission } from "@/lib/api-contract";
import { ApiError, authApi, type AuthenticatedUser } from "@/lib/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthContextValue {
  currentUser: AuthenticatedUser | null;
  status: AuthStatus;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryRestore: () => Promise<void>;
  hasPermission: (permission: ApiPermission) => boolean;
  getUserPermissions: () => ApiPermission[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const restore = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const user = await authApi.restore();
      setCurrentUser(user);
      setStatus("authenticated");
    } catch (cause) {
      authApi.clearAccessToken();
      setCurrentUser(null);
      if (cause instanceof ApiError && cause.status === 401) {
        setStatus("unauthenticated");
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Impossible de restaurer la session",
        );
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void restore(), 0);
    return () => window.clearTimeout(timeout);
  }, [restore]);

  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/connexion") {
      router.replace(`/connexion?retour=${encodeURIComponent(pathname)}`);
    }
    if (status === "authenticated" && pathname === "/connexion") {
      router.replace("/");
    }
  }, [pathname, router, status]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const user = await authApi.login(email, password);
    setCurrentUser(user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setCurrentUser(null);
    setStatus("unauthenticated");
    router.replace("/connexion");
  }, [router]);

  const hasPermission = useCallback(
    (permission: ApiPermission): boolean => {
      return currentUser?.permissions.includes(permission) ?? false;
    },
    [currentUser],
  );

  const permissions = useCallback((): ApiPermission[] => {
    return currentUser?.permissions ?? [];
  }, [currentUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      status,
      error,
      login,
      logout,
      retryRestore: restore,
      hasPermission,
      getUserPermissions: permissions,
    }),
    [
      currentUser,
      error,
      hasPermission,
      login,
      logout,
      permissions,
      restore,
      status,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const DASHBOARD_ROUTE_PERMISSIONS: Array<{
  prefix: string;
  permission: ApiPermission;
}> = [
  { prefix: "/utilisateurs", permission: Permission.USERS_READ },
  { prefix: "/parametres", permission: Permission.SETTINGS_READ },
  { prefix: "/rapports", permission: Permission.REPORTS_READ },
  { prefix: "/audit", permission: Permission.AUDIT_READ },
  { prefix: "/tasks", permission: Permission.TASKS_READ },
  { prefix: "/crm", permission: Permission.PROSPECTS_READ },
  { prefix: "/clients", permission: Permission.CLIENTS_READ },
  { prefix: "/offres", permission: Permission.OFFERS_READ },
  { prefix: "/dossiers", permission: Permission.DOSSIERS_READ },
  { prefix: "/vehicules", permission: Permission.VEHICLES_READ },
  { prefix: "/fournisseurs", permission: Permission.PARTNERS_READ },
  { prefix: "/expeditions", permission: Permission.SHIPMENTS_READ },
  { prefix: "/finance", permission: Permission.FINANCE_READ },
  { prefix: "/documents", permission: Permission.DOCUMENTS_READ },
  { prefix: "/facturation", permission: Permission.PAYMENTS_READ },
  { prefix: "/notifications", permission: Permission.NOTIFICATIONS_READ },
  { prefix: "/", permission: Permission.DASHBOARD_READ },
];
