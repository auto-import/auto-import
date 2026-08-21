'use client';

import { Sidebar } from '@/components';
import { AuthProvider } from '@/components/AuthProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-surface">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}