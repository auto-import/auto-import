'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Car,
  FolderOpen,
  Handshake,
  Ship,
  Receipt,
  Users,
  Bell,
  UserCog,
  BarChart3,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { SIDEBAR_NAV_ITEMS } from '@/lib/constants';

const ICON_MAP: Record<string, ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="w-5 h-5" />,
  Car: <Car className="w-5 h-5" />,
  FolderOpen: <FolderOpen className="w-5 h-5" />,
  Handshake: <Handshake className="w-5 h-5" />,
  Ship: <Ship className="w-5 h-5" />,
  Receipt: <Receipt className="w-5 h-5" />,
  Users: <Users className="w-5 h-5" />,
  Bell: <Bell className="w-5 h-5" />,
  UserCog: <UserCog className="w-5 h-5" />,
  BarChart3: <BarChart3 className="w-5 h-5" />,
  Settings: <Settings className="w-5 h-5" />,
};

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-64 h-screen bg-sidebar-bg border-e border-border flex flex-col shrink-0 sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="w-9 h-9 bg-foreground rounded-lg flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-white" />
        </div>
        <span className="text-base font-bold text-foreground">CarImport DZ</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {SIDEBAR_NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                    ${active
                      ? 'bg-sidebar-active-bg text-sidebar-active-text'
                      : 'text-foreground hover:bg-sidebar-hover-bg'
                    }
                  `}
                >
                  {ICON_MAP[item.icon]}
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
