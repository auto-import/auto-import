import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { I18nProvider } from "@/components/I18nProvider";
import { BrandingProvider } from "@/components/BrandingProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CarImport DZ — ERP",
  description:
    "Système de gestion des importations de véhicules — CarImport DZ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>
          <I18nProvider>
            <BrandingProvider>{children}</BrandingProvider>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
