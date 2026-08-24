"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  DASHBOARD_ROUTE_PERMISSIONS,
  useAuth,
} from "@/components/AuthProvider";

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, error, hasPermission, retryRestore } = useAuth();
  const requiredPermission = DASHBOARD_ROUTE_PERMISSIONS.find(
    ({ prefix }) => prefix === "/" || pathname.startsWith(prefix),
  )?.permission;
  const unauthorized =
    status === "authenticated" &&
    Boolean(requiredPermission) &&
    !hasPermission(requiredPermission!);

  useEffect(() => {
    if (unauthorized) router.replace("/interdit");
  }, [router, unauthorized]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-muted">
        Chargement de votre session…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">
            Connexion au serveur impossible
          </h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button
            className="btn-primary mt-5"
            onClick={() => void retryRestore()}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (status !== "authenticated" || unauthorized) return null;
  return children;
}
