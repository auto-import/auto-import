"use client";

import { Sidebar } from "@/components";
import { AuthBoundary } from "@/components/AuthBoundary";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthBoundary>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-surface">{children}</main>
      </div>
    </AuthBoundary>
  );
}
