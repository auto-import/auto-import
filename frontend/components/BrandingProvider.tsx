"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { profileApi } from "@/lib/api";
import { useAuth } from "./AuthProvider";

interface BrandingValue {
  companyName: string;
  logoUrl: string | null;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { currentUser, status } = useAuth();
  const [companyName, setCompanyName] = useState("CarImport DZ");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoRef = useRef<string | null>(null);

  const refreshBranding = useCallback(async () => {
    if (!currentUser) return;
    const profile = await profileApi.get();
    setCompanyName(profile.branding.companyName || "CarImport DZ");
    let nextUrl: string | null = null;
    if (profile.branding.logoUrl) {
      nextUrl = URL.createObjectURL(await profileApi.brandingLogoBlob());
    }
    setLogoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      logoRef.current = nextUrl;
      return nextUrl;
    });
  }, [currentUser]);

  useEffect(() => {
    if (status !== "authenticated") {
      const timer = window.setTimeout(() => {
        setCompanyName("CarImport DZ");
        setLogoUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          logoRef.current = null;
          return null;
        });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => void refreshBranding(), 0);
    const refresh = () => void refreshBranding();
    window.addEventListener("tenant-branding-changed", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("tenant-branding-changed", refresh);
    };
  }, [refreshBranding, status]);

  useEffect(
    () => () => {
      if (logoRef.current) URL.revokeObjectURL(logoRef.current);
    },
    [],
  );

  const value = useMemo(
    () => ({ companyName, logoUrl, refreshBranding }),
    [companyName, logoUrl, refreshBranding],
  );
  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const value = useContext(BrandingContext);
  return (
    value ?? {
      companyName: "CarImport DZ",
      logoUrl: null,
      refreshBranding: async () => undefined,
    }
  );
}
