"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Car, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/components/I18nProvider";

function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue.";
  }
  if (error.code === "NETWORK_ERROR") {
    return "Le serveur est inaccessible. Vérifiez votre connexion puis réessayez.";
  }
  if (/inactive|organization/i.test(error.message)) {
    return "Ce compte ou son organisation est inactif. Contactez un administrateur.";
  }
  if (error.status === 401) {
    return "Adresse e-mail ou mot de passe incorrect.";
  }
  return error.message;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/");
    } catch (cause) {
      setError(loginErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-sm">
        <div className="mb-4 flex justify-end gap-2" aria-label={t("language")}>
          {(["fr", "en"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => void setLocale(choice)}
              aria-pressed={locale === choice}
              className="rounded-md border border-border px-2 py-1 text-xs font-semibold"
            >
              {choice.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground">
            <Car className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">CarImport DZ</h1>
            <p className="text-sm text-muted">{t("secureErpAccess")}</p>
          </div>
        </div>

        <h2 className="text-2xl font-semibold">{t("signIn")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("credentialHelp")}
        </p>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium" htmlFor="email">
            {t("emailAddress")}
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-border px-3 focus-within:border-foreground">
              <Mail className="h-4 w-4 text-muted" />
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-transparent py-3 text-sm outline-none"
                placeholder="nom@entreprise.dz"
              />
            </span>
          </label>

          <label className="block text-sm font-medium" htmlFor="password">
            {t("password")}
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-border px-3 focus-within:border-foreground">
              <LockKeyhole className="h-4 w-4 text-muted" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent py-3 text-sm outline-none"
                placeholder={t("yourPassword")}
              />
            </span>
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-status-red-bg px-4 py-3 text-sm text-status-red-text"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {submitting ? t("signingIn") : t("signInAction")}
          </button>
        </form>
      </section>
    </main>
  );
}
