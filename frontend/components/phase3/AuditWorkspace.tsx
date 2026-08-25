"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import Topbar from "@/components/Topbar";
import { phase3Api } from "@/lib/phase3-api";
import { ErrorState, LoadingState } from "@/components/commerce/common";

type AuditItem = Awaited<ReturnType<typeof phase3Api.audit>>["items"][number];
export default function AuditWorkspace() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setError("");
    try {
      setItems((await phase3Api.audit({ limit: 100 })).items);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <>
      <Topbar
        title="Journal d’audit"
        subtitle="Mutations append-only de l’organisation"
      />
      <main className="p-4 sm:p-8">
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading ? (
          <LoadingState />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            {items.length ? (
              items.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-2 border-b border-border p-4 text-sm last:border-0 sm:grid-cols-[36px_150px_1fr_200px]"
                >
                  <ShieldCheck className="h-5 w-5 text-muted" />
                  <strong>{item.action.toUpperCase()}</strong>
                  <span>
                    {item.entityType} · {item.entityId}
                    <span className="mt-1 block text-xs text-muted">
                      {item.newValues?.changedFields?.join(", ") ||
                        "Aucune valeur sensible enregistrée"}
                    </span>
                  </span>
                  <span className="text-xs text-muted sm:text-right">
                    {item.user
                      ? `${item.user.firstName} ${item.user.lastName}`
                      : "Système"}
                    <br />
                    {new Date(item.createdAt).toLocaleString("fr-FR")}
                  </span>
                </article>
              ))
            ) : (
              <p className="p-10 text-center text-sm text-muted">
                Aucune mutation auditée.
              </p>
            )}
          </div>
        )}
      </main>
    </>
  );
}
