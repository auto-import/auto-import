"use client";
import { useState, type FormEvent } from "react";
import { twoFactorApi } from "@/lib/two-factor-api";

export default function TwoFactorResetDialog({
  user,
  close,
}: {
  user: { id: string; firstName: string; lastName: string };
  close: () => void;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await twoFactorApi.reset(
        user.id,
        password,
        code.trim() || undefined,
        reason.trim(),
      );
      setPassword("");
      setCode("");
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Réinitialisation impossible.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-2fa-title"
    >
      <section className="card max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto">
        <h2 id="reset-2fa-title" className="font-bold">
          Réinitialiser la 2FA — {user.firstName} {user.lastName}
        </h2>
        {done ? (
          <p role="status">
            La 2FA a été réinitialisée et les sessions de cet utilisateur ont
            été fermées. L’action est enregistrée dans l’audit.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm">
              Cette action retire son authenticator et ses codes de
              récupération. Vérifiez son identité avant de poursuivre.
            </p>
            <label className="block text-sm">
              Votre mot de passe actuel
              <input
                required
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Votre code authenticator ou de récupération, si votre 2FA est
              activée
              <input
                autoComplete="one-time-code"
                maxLength={39}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Motif de la réinitialisation
              <textarea
                required
                minLength={10}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {busy ? "Vérification…" : "Réinitialiser la 2FA"}
            </button>
          </form>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={close}
          className="text-sm underline"
        >
          {done ? "Fermer" : "Annuler"}
        </button>
      </section>
    </div>
  );
}
