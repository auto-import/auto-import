'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Target, PhoneCall } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Permission } from '@/lib/api-contract';
import type { ApiPermission } from '@/lib/api-contract';

const CRM_TABS: Array<{ label: string; href: string; icon: typeof Target; permission?: ApiPermission }> = [
  { label: 'Leads', href: '/crm/leads', icon: Target },
  { label: 'Clients', href: '/crm/clients', icon: Users },
  { label: "Centre d'appels", href: '/crm/call-center', icon: PhoneCall, permission: Permission.CALL_CENTER_ACCESS },
];

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hasPermission } = useAuth();

  const visibleTabs = CRM_TABS.filter(
    (tab) => !tab.permission || hasPermission(tab.permission),
  );

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-background">
        <div className="px-8 pt-4">
          <div className="flex items-center gap-6">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}