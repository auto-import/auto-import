import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";

export const inputClass =
  "w-full rounded-input border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10";
export const buttonClass =
  "rounded-button bg-foreground px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="card flex items-center justify-center gap-2 p-10 text-sm text-muted">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="card flex items-center justify-between gap-4 border-red-200 p-5 text-sm text-red-700">
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        {message}
      </span>
      <button
        onClick={retry}
        className="flex items-center gap-2 rounded-button border border-red-200 px-3 py-2"
      >
        <RefreshCw className="h-4 w-4" />
        Réessayer
      </button>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="card p-10 text-center text-sm text-muted">{label}</div>
  );
}

export function formatMoney(
  value: string | number | null | undefined,
  currency?: string | null,
) {
  if (value == null) return "—";
  return `${Number(value).toLocaleString("fr-FR")} ${currency ?? ""}`.trim();
}
