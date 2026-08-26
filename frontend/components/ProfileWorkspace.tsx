"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, KeyRound, Trash2 } from "lucide-react";
import Topbar from "@/components/Topbar";
import { authApi, profileApi, type ApiProfile } from "@/lib/api";
import {
  ErrorState,
  LoadingState,
  inputClass,
} from "@/components/commerce/common";

export default function ProfileWorkspace() {
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const avatarRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmation: "",
  });

  async function load() {
    setError("");
    try {
      const next = await profileApi.get();
      setProfile(next);
      let avatarBlob: Blob | null = null;
      if (next.avatarUrl) {
        avatarBlob = await profileApi.avatarBlob();
        const url = URL.createObjectURL(avatarBlob);
        setAvatar((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          avatarRef.current = url;
          return url;
        });
      } else {
        if (avatarRef.current) URL.revokeObjectURL(avatarRef.current);
        avatarRef.current = null;
        setAvatar(null);
      }
      window.dispatchEvent(
        new CustomEvent("profile-avatar-changed", {
          detail: avatarBlob,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Profil indisponible");
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      if (avatarRef.current) URL.revokeObjectURL(avatarRef.current);
    };
  }, []);

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      ) {
        throw new Error(
          "Choisissez une image JPEG, PNG ou WebP de 5 Mo maximum.",
        );
      }
      await profileApi.uploadAvatar(file);
      await load();
      setMessage("Avatar mis à jour.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import impossible");
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setError("");
    try {
      await profileApi.removeAvatar();
      await load();
      setMessage("Avatar supprimé.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Suppression impossible",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (password.newPassword !== password.confirmation)
        throw new Error("La confirmation ne correspond pas.");
      await authApi.changePassword(password);
      setPassword({ currentPassword: "", newPassword: "", confirmation: "" });
      setMessage(
        "Mot de passe modifié. La session actuelle a été renouvelée et les autres sessions ont été révoquées.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Modification impossible",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar
        title="Mon profil"
        subtitle="Identité, avatar et sécurité du compte"
        avatarUrlOverride={avatar}
      />
      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
        {error && <ErrorState message={error} retry={() => void load()} />}
        {message && (
          <p
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {message}
          </p>
        )}
        {!profile ? (
          <LoadingState />
        ) : (
          <>
            <section className="card grid gap-6 sm:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-2xl font-bold text-white">
                  {avatar ? (
                    <Image
                      unoptimized
                      width={112}
                      height={112}
                      src={avatar}
                      alt={`Avatar de ${profile.firstName} ${profile.lastName}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    `${profile.firstName[0]}${profile.lastName[0]}`
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                  <Camera className="h-4 w-4" /> Changer
                  <input
                    disabled={busy}
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void upload(event.target.files?.[0])}
                  />
                </label>
                {profile.avatarUrl && (
                  <button
                    disabled={busy}
                    onClick={() => void removeAvatar()}
                    className="inline-flex items-center gap-2 text-sm text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </button>
                )}
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info
                  label="Nom"
                  value={`${profile.firstName} ${profile.lastName}`}
                />
                <Info label="E-mail" value={profile.email} />
                <Info label="Organisation" value={profile.organization.name} />
                <Info
                  label="Bureau"
                  value={
                    profile.office
                      ? `${profile.office.name}${profile.office.city ? ` · ${profile.office.city}` : ""}`
                      : "Non affecté"
                  }
                />
                <Info
                  label="Rôles"
                  value={
                    profile.roles.map(({ name }) => name).join(", ") || "Aucun"
                  }
                />
                <Info
                  label="Statut"
                  value={profile.status === "active" ? "Actif" : profile.status}
                />
              </dl>
            </section>
            <section className="card">
              <div className="flex items-center gap-3">
                <KeyRound className="h-5 w-5" />
                <div>
                  <h2 className="font-bold">Changer mon mot de passe</h2>
                  <p className="text-sm text-muted">
                    12 caractères minimum, avec majuscule, minuscule, chiffre et
                    symbole.
                  </p>
                </div>
              </div>
              <form
                onSubmit={changePassword}
                className="mt-5 grid gap-4 sm:grid-cols-2"
              >
                <Password
                  label="Mot de passe actuel"
                  value={password.currentPassword}
                  onChange={(value) =>
                    setPassword((current) => ({
                      ...current,
                      currentPassword: value,
                    }))
                  }
                />
                <span className="hidden sm:block" />
                <Password
                  label="Nouveau mot de passe"
                  value={password.newPassword}
                  onChange={(value) =>
                    setPassword((current) => ({
                      ...current,
                      newPassword: value,
                    }))
                  }
                />
                <Password
                  label="Confirmation"
                  value={password.confirmation}
                  onChange={(value) =>
                    setPassword((current) => ({
                      ...current,
                      confirmation: value,
                    }))
                  }
                />
                <button
                  disabled={busy}
                  className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2 sm:justify-self-end"
                >
                  {busy ? "Enregistrement…" : "Mettre à jour"}
                </button>
              </form>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
function Password({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <input
        required
        type="password"
        autoComplete="new-password"
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
