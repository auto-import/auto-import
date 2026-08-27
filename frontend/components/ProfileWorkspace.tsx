"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Building2, Camera, KeyRound, Languages, Trash2 } from "lucide-react";
import Topbar from "@/components/Topbar";
import { authApi, profileApi, type ApiProfile } from "@/lib/api";
import {
  ErrorState,
  LoadingState,
  inputClass,
} from "@/components/commerce/common";
import { useI18n } from "@/components/I18nProvider";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import { useBranding } from "@/components/BrandingProvider";

export default function ProfileWorkspace() {
  const { locale, setLocale, t } = useI18n();
  const { hasPermission } = useAuth();
  const { logoUrl, refreshBranding } = useBranding();
  const canManageBranding = hasPermission(Permission.SETTINGS_WRITE);
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const avatarRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmation: "",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await profileApi.get();
      setProfile(next);
      setCompanyName(next.branding.companyName);
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
      setError(
        cause instanceof Error ? cause.message : t("profileUnavailable"),
      );
    }
  }, [t]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      if (avatarRef.current) URL.revokeObjectURL(avatarRef.current);
    };
  }, [load]);

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
        throw new Error(t("chooseImage"));
      }
      await profileApi.uploadAvatar(file);
      await load();
      setMessage(t("avatarUpdated"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("uploadFailed"));
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
      setMessage(t("avatarRemoved"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("deleteFailed"));
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
        throw new Error(t("passwordMismatch"));
      await authApi.changePassword(password);
      setPassword({ currentPassword: "", newPassword: "", confirmation: "" });
      setMessage(t("passwordUpdated"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveBranding(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await profileApi.updateBranding(companyName);
      await refreshBranding();
      await load();
      window.dispatchEvent(new Event("tenant-branding-changed"));
      setMessage(t("brandingSaved"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadBrandingLogo(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 2 * 1024 * 1024
      ) {
        throw new Error(t("logoRule"));
      }
      await profileApi.uploadBrandingLogo(file);
      await refreshBranding();
      window.dispatchEvent(new Event("tenant-branding-changed"));
      setMessage(t("logoUpdated"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeBrandingLogo() {
    setBusy(true);
    setError("");
    try {
      await profileApi.removeBrandingLogo();
      await refreshBranding();
      window.dispatchEvent(new Event("tenant-branding-changed"));
      setMessage(t("logoRemoved"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar
        title={t("profileTitle")}
        subtitle={t("profileSubtitle")}
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
                  <Camera className="h-4 w-4" /> {t("change")}
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
                    {t("remove")}
                  </button>
                )}
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info
                  label={t("name")}
                  value={`${profile.firstName} ${profile.lastName}`}
                />
                <Info label={t("email")} value={profile.email} />
                <Info
                  label={t("organization")}
                  value={profile.organization.name}
                />
                <Info
                  label={t("office")}
                  value={
                    profile.office
                      ? `${profile.office.name}${profile.office.city ? ` · ${profile.office.city}` : ""}`
                      : t("unassigned")
                  }
                />
                <Info
                  label={t("roles")}
                  value={
                    profile.roles.map(({ name }) => name).join(", ") ||
                    t("none")
                  }
                />
                <Info
                  label={t("status")}
                  value={
                    profile.status === "active" ? t("active") : profile.status
                  }
                />
              </dl>
            </section>
            <section className="card">
              <div className="flex items-center gap-3">
                <Languages className="h-5 w-5" />
                <div>
                  <h2 className="font-bold">{t("language")}</h2>
                  <p className="text-sm text-muted">{t("preferenceHelp")}</p>
                </div>
              </div>
              <div
                className="mt-4 flex gap-3"
                role="radiogroup"
                aria-label={t("language")}
              >
                {(["fr", "en"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={locale === value}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await setLocale(value);
                        setMessage(
                          value === "fr"
                            ? t("languageUpdated")
                            : "Language updated.",
                        );
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Language update failed",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold ${locale === value ? "border-neutral-900 bg-neutral-900 text-white" : "border-border"}`}
                  >
                    {value === "fr" ? t("french") : t("english")}
                  </button>
                ))}
              </div>
            </section>
            {canManageBranding && (
              <section className="card">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5" />
                  <div>
                    <h2 className="font-bold">{t("companyBranding")}</h2>
                    <p className="text-sm text-muted">
                      {t("companyBrandingHelp")}
                    </p>
                  </div>
                </div>
                <form
                  onSubmit={saveBranding}
                  className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
                >
                  <label>
                    <span className="field-label">{t("companyName")}</span>
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      className={inputClass}
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy}
                    className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    {busy ? t("saving") : t("save")}
                  </button>
                </form>
                <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
                    {logoUrl ? (
                      <Image
                        unoptimized
                        src={logoUrl}
                        alt={t("companyLogoAlt")}
                        width={80}
                        height={80}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <Building2 className="h-7 w-7 text-muted" />
                    )}
                  </div>
                  <div className="min-w-56 flex-1">
                    <p className="font-semibold">{t("companyLogo")}</p>
                    <p className="text-sm text-muted">{t("logoRule")}</p>
                  </div>
                  <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                    {t("change")}
                    <input
                      disabled={busy}
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        void uploadBrandingLogo(event.target.files?.[0])
                      }
                    />
                  </label>
                  {logoUrl && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeBrandingLogo()}
                      className="inline-flex items-center gap-2 text-sm text-red-700"
                    >
                      <Trash2 className="h-4 w-4" /> {t("remove")}
                    </button>
                  )}
                </div>
              </section>
            )}
            <section className="card">
              <div className="flex items-center gap-3">
                <KeyRound className="h-5 w-5" />
                <div>
                  <h2 className="font-bold">{t("changePassword")}</h2>
                  <p className="text-sm text-muted">{t("passwordRule")}</p>
                </div>
              </div>
              <form
                onSubmit={changePassword}
                className="mt-5 grid gap-4 sm:grid-cols-2"
              >
                <Password
                  label={t("currentPassword")}
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
                  label={t("newPassword")}
                  value={password.newPassword}
                  onChange={(value) =>
                    setPassword((current) => ({
                      ...current,
                      newPassword: value,
                    }))
                  }
                />
                <Password
                  label={t("confirmation")}
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
                  {busy ? t("saving") : t("update")}
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
