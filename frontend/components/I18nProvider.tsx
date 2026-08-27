"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { profileApi } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { LocalizedInterfaceBoundary } from "./LocalizedInterfaceBoundary";
import { setRuntimeLocale } from "@/lib/i18n/runtime-locale";

type Locale = "fr" | "en";
const catalog = {
  fr: {
    dashboard: "Tableau de bord",
    vehicles: "Véhicules",
    offers: "Offres Chine",
    dossiers: "Dossiers",
    suppliers: "Fournisseurs",
    shipping: "Expéditions",
    billing: "Facturation",
    finance: "Finance",
    documents: "Documents",
    crm: "CRM",
    callCenter: "Centre d’appels",
    tasks: "Tâches",
    notifications: "Notifications",
    reports: "Rapports",
    settings: "Paramètres",
    users: "Utilisateurs",
    profile: "Mon profil",
    language: "Langue",
    french: "Français",
    english: "Anglais",
    save: "Enregistrer",
    logout: "Déconnexion",
    notProvided: "Non renseigné",
    integrations: "Intégrations",
    profileTitle: "Mon profil",
    profileSubtitle: "Identité, avatar et sécurité du compte",
    profileUnavailable: "Profil indisponible",
    chooseImage: "Choisissez une image JPEG, PNG ou WebP de 5 Mo maximum.",
    avatarUpdated: "Avatar mis à jour.",
    uploadFailed: "Import impossible",
    avatarRemoved: "Avatar supprimé.",
    deleteFailed: "Suppression impossible",
    passwordMismatch: "La confirmation ne correspond pas.",
    passwordUpdated:
      "Mot de passe modifié. La session actuelle a été renouvelée et les autres sessions ont été révoquées.",
    updateFailed: "Modification impossible",
    name: "Nom",
    email: "E-mail",
    organization: "Organisation",
    office: "Bureau",
    unassigned: "Non affecté",
    roles: "Rôles",
    none: "Aucun",
    status: "Statut",
    active: "Actif",
    preferenceHelp:
      "La préférence est enregistrée pour votre compte et appliquée immédiatement.",
    change: "Changer",
    remove: "Supprimer",
    changePassword: "Changer mon mot de passe",
    passwordRule:
      "12 caractères minimum, avec majuscule, minuscule, chiffre et symbole.",
    currentPassword: "Mot de passe actuel",
    newPassword: "Nouveau mot de passe",
    confirmation: "Confirmation",
    saving: "Enregistrement…",
    update: "Mettre à jour",
    languageUpdated: "Langue mise à jour.",
    user: "Utilisateur",
    companyLogoAlt: "Logo de l'entreprise",
    companyBranding: "Identité de l'entreprise",
    companyBrandingHelp:
      "Ce nom et ce logo sont visibles par tous les utilisateurs de l'organisation.",
    companyName: "Nom de l'entreprise",
    companyLogo: "Logo de l'entreprise",
    brandingSaved: "Identité de l'entreprise mise à jour.",
    logoUpdated: "Logo de l'entreprise mis à jour.",
    logoRemoved: "Logo de l'entreprise supprimé.",
    logoRule: "Image PNG, JPEG ou WebP, 2 Mo maximum.",
    secureErpAccess: "Accès sécurisé à votre ERP",
    signIn: "Connexion",
    credentialHelp: "Utilisez les identifiants fournis par votre administrateur.",
    emailAddress: "Adresse e-mail",
    password: "Mot de passe",
    yourPassword: "Votre mot de passe",
    signingIn: "Connexion en cours…",
    signInAction: "Se connecter",
    accessDenied: "Accès interdit",
    accessDeniedHelp:
      "Votre compte ne possède pas la permission nécessaire pour ouvrir cette page.",
    backToDashboard: "Retour au tableau de bord",
  },
  en: {
    dashboard: "Dashboard",
    vehicles: "Vehicles",
    offers: "China offers",
    dossiers: "Dossiers",
    suppliers: "Suppliers",
    shipping: "Shipments",
    billing: "Billing",
    finance: "Finance",
    documents: "Documents",
    crm: "CRM",
    callCenter: "Call center",
    tasks: "Tasks",
    notifications: "Notifications",
    reports: "Reports",
    settings: "Settings",
    users: "Users",
    profile: "My profile",
    language: "Language",
    french: "French",
    english: "English",
    save: "Save",
    logout: "Sign out",
    notProvided: "Not provided",
    integrations: "Integrations",
    profileTitle: "My profile",
    profileSubtitle: "Identity, avatar and account security",
    profileUnavailable: "Profile unavailable",
    chooseImage: "Choose a JPEG, PNG or WebP image up to 5 MB.",
    avatarUpdated: "Avatar updated.",
    uploadFailed: "Upload failed",
    avatarRemoved: "Avatar removed.",
    deleteFailed: "Removal failed",
    passwordMismatch: "The confirmation does not match.",
    passwordUpdated:
      "Password changed. This session was renewed and other sessions were revoked.",
    updateFailed: "Update failed",
    name: "Name",
    email: "Email",
    organization: "Organization",
    office: "Office",
    unassigned: "Unassigned",
    roles: "Roles",
    none: "None",
    status: "Status",
    active: "Active",
    preferenceHelp:
      "The preference is saved to your account and applied immediately.",
    change: "Change",
    remove: "Remove",
    changePassword: "Change my password",
    passwordRule:
      "At least 12 characters with uppercase, lowercase, a number and a symbol.",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmation: "Confirmation",
    saving: "Saving…",
    update: "Update",
    languageUpdated: "Language updated.",
    user: "User",
    companyLogoAlt: "Company logo",
    companyBranding: "Company branding",
    companyBrandingHelp:
      "This name and logo are visible to every user in the organization.",
    companyName: "Company name",
    companyLogo: "Company logo",
    brandingSaved: "Company branding updated.",
    logoUpdated: "Company logo updated.",
    logoRemoved: "Company logo removed.",
    logoRule: "PNG, JPEG or WebP image, up to 2 MB.",
    secureErpAccess: "Secure access to your ERP",
    signIn: "Sign in",
    credentialHelp: "Use the credentials supplied by your administrator.",
    emailAddress: "Email address",
    password: "Password",
    yourPassword: "Your password",
    signingIn: "Signing in…",
    signInAction: "Sign in",
    accessDenied: "Access denied",
    accessDeniedHelp:
      "Your account does not have permission to open this page.",
    backToDashboard: "Return to dashboard",
  },
} as const;
type TranslationKey = keyof typeof catalog.fr;
const catalogParity: Record<Locale, Record<TranslationKey, string>> = catalog;

export function translationCatalogKeys(locale: Locale) {
  return Object.keys(catalogParity[locale]).sort();
}

export function translateCatalogKey(locale: Locale, key: TranslationKey) {
  const translated = catalogParity[locale][key];
  if (!translated) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`Missing ${locale} translation for ${key}`);
    }
    return locale === "fr" ? "Traduction indisponible" : "Translation unavailable";
  }
  return translated;
}

interface I18nValue {
  locale: Locale;
  t: (key: TranslationKey) => string;
  setLocale: (locale: Locale) => Promise<void>;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (
    value: string | Date,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { currentUser, refreshCurrentUser } = useAuth();
  const [cachedLocale, setCachedLocale] = useState<Locale>("fr");
  const locale: Locale = currentUser
    ? currentUser.locale === "en"
      ? "en"
      : "fr"
    : cachedLocale;
  useEffect(() => {
    const stored = window.localStorage.getItem("auto-import.locale");
    const timer = window.setTimeout(() => {
      if (stored === "en" || stored === "fr") setCachedLocale(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    setRuntimeLocale(locale);
    window.localStorage.setItem("auto-import.locale", locale);
    const timer = window.setTimeout(() => setCachedLocale(locale), 0);
    return () => window.clearTimeout(timer);
  }, [locale]);
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: (key) => translateCatalogKey(locale, key),
      setLocale: async (next) => {
        setCachedLocale(next);
        window.localStorage.setItem("auto-import.locale", next);
        if (currentUser) {
          await profileApi.updateLocale(next);
          await refreshCurrentUser();
        }
        window.dispatchEvent(
          new CustomEvent("locale-changed", { detail: next }),
        );
      },
      formatNumber: (number, options) =>
        new Intl.NumberFormat(
          locale === "fr" ? "fr-DZ" : "en-US",
          options,
        ).format(number),
      formatDate: (date, options) =>
        new Intl.DateTimeFormat(
          locale === "fr" ? "fr-DZ" : "en-US",
          options,
        ).format(new Date(date)),
    }),
    [currentUser, locale, refreshCurrentUser],
  );
  return (
    <I18nContext.Provider value={value}>
      <LocalizedInterfaceBoundary locale={locale}>
        {children}
      </LocalizedInterfaceBoundary>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
