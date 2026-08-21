'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Target } from 'lucide-react';

const CRM_TABS = [
  { label: 'Leads', href: '/crm/leads', icon: Target },
  { label: 'Clients', href: '/crm/clients', icon: Users },
];

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-background">
        <div className="px-8 pt-4">
          <div className="flex items-center gap-6">
            {CRM_TABS.map((tab) => {
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