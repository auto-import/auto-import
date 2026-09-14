"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useAuth } from "./AuthProvider";
import {
  twoFactorApi,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from "@/lib/two-factor-api";

export default function TwoFactorSettings() {
  const { logout } = useAuth();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    twoFactorApi
      .status()
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch(() => {
        if (active) setError("Impossible de charger la sécurité du compte.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (status?.enabled) {
        await twoFactorApi.disable(password, code.trim());
        setPassword("");
        setCode("");
        await logout();
      } else if (setup) {
        const result = await twoFactorApi.enable(code.trim());
        setRecoveryCodes(result.recoveryCodes);
        setSetup(null);
        setCode("");
        setPassword("");
      } else {
        setSetup(await twoFactorApi.setup(password));
        setPassword("");
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "La vérification a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-y-4" aria-labelledby="two-factor-title">
      <h2 id="two-factor-title" className="font-bold">
        Authentification à deux facteurs (2FA)
      </h2>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {recoveryCodes.length > 0 ? (
        <div className="space-y-4">
          <p role="status">
            La 2FA est activée. Enregistrez ces codes de récupération maintenant
            : ils ne seront plus affichés.
          </p>
          <ul className="grid gap-2 font-mono text-sm sm:grid-cols-2">
            {recoveryCodes.map((value) => (
              <li key={value} className="break-all select-all">
                {value}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Chaque code est utilisable une seule fois. Vos anciennes sessions
            ont été fermées. Attendez le prochain code de l’application avant de
            vous reconnecter.
          </p>
          <button
            type="button"
            onClick={async () => {
              setRecoveryCodes([]);
              await logout();
            }}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-white"
          >
            J’ai enregistré mes codes — me reconnecter
          </button>
        </div>
      ) : !status ? (
        <p>Chargement de la sécurité…</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm">
            {status.enabled
              ? `Activée · ${status.recoveryCodesRemaining} codes de récupération restants`
              : "Ajoutez un code authenticator à votre mot de passe."}
          </p>
          {setup ? (
            <div className="space-y-3">
              <p>Scannez ce QR code avec votre application authenticator.</p>
              <Image
                src={setup.qrCodeDataUrl}
                width={280}
                height={280}
                unoptimized
                alt="QR code de configuration authenticator"
                className="max-w-full"
              />
              <p className="text-sm">Ou saisissez cette clé manuellement :</p>
              <code className="block break-all select-all">{setup.secret}</code>
              <p className="text-sm text-muted">
                La configuration expire après dix minutes. Elle ne sera activée
                qu’après vérification du code.
              </p>
            </div>
          ) : (
            <label className="block text-sm">
              Mot de passe actuel
              <input
                required
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              />
            </label>
          )}
          {(setup || status.enabled) && (
            <label className="block text-sm">
              {status.enabled
                ? "Code authenticator ou code de récupération"
                : "Code authenticator (6 chiffres)"}
              <input
                required
                autoComplete="one-time-code"
                inputMode={status.enabled ? "text" : "numeric"}
                maxLength={status.enabled ? 39 : 6}
                pattern={status.enabled ? undefined : "[0-9]{6}"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              />
            </label>
          )}
          {status.enabled && (
            <p className="text-sm text-muted">
              La désactivation fermera vos sessions et demandera une nouvelle
              connexion.
            </p>
          )}
          <button
            disabled={busy}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? "Vérification…"
              : status.enabled
                ? "Désactiver la 2FA"
                : setup
                  ? "Vérifier et activer"
                  : "Configurer la 2FA"}
          </button>
          {setup && (
            <button
              type="button"
              disabled={busy}
              className="ml-3 text-sm underline"
              onClick={() => {
                setSetup(null);
                setCode("");
                setError("");
              }}
            >
              Recommencer la configuration
            </button>
          )}
        </form>
      )}
    </section>
  );
}
