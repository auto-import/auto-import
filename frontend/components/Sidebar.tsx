"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  PackageSearch,
  FileText,
  CheckSquare,
  DollarSign,
  PhoneCall,
} from "lucide-react";
import type { ReactNode } from "react";
import { SIDEBAR_NAV_ITEMS } from "@/lib/constants";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import type { ApiPermission } from "@/lib/api-contract";

const ICON_MAP: Record<string, ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="w-5 h-5" />,
  Car: <Car className="w-5 h-5" />,
  PackageSearch: <PackageSearch className="w-5 h-5" />,
  FolderOpen: <FolderOpen className="w-5 h-5" />,
  Handshake: <Handshake className="w-5 h-5" />,
  Ship: <Ship className="w-5 h-5" />,
  Receipt: <Receipt className="w-5 h-5" />,
  Users: <Users className="w-5 h-5" />,
  Bell: <Bell className="w-5 h-5" />,
  UserCog: <UserCog className="w-5 h-5" />,
  BarChart3: <BarChart3 className="w-5 h-5" />,
  Settings: <Settings className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  CheckSquare: <CheckSquare className="w-5 h-5" />,
  DollarSign: <DollarSign className="w-5 h-5" />,
  PhoneCall: <PhoneCall className="w-5 h-5" />,
};

const ROUTE_PERMISSIONS: Record<string, ApiPermission> = {
  "/": Permission.DASHBOARD_READ,
  "/crm": Permission.PROSPECTS_READ,
  "/crm/call-center": Permission.CALL_CENTER_ACCESS,
  "/offres": Permission.OFFERS_READ,
  "/dossiers": Permission.DOSSIERS_READ,
  "/vehicules": Permission.VEHICLES_READ,
  "/fournisseurs": Permission.PARTNERS_READ,
  "/expeditions": Permission.SHIPMENTS_READ,
  "/facturation": Permission.PAYMENTS_READ,
  "/finance": Permission.FINANCE_READ,
  "/documents": Permission.DOCUMENTS_READ,
  "/tasks": Permission.TASKS_READ,
  "/notifications": Permission.NOTIFICATIONS_READ,
  "/rapports": Permission.REPORTS_READ,
  "/parametres": Permission.SETTINGS_READ,
  "/utilisateurs": Permission.USERS_READ,
};

export default function Sidebar() {
  const pathname = usePathname();
  const { hasPermission, currentUser } = useAuth();
  const initials = currentUser
    ? `${currentUser.firstName[0] ?? ""}${currentUser.lastName[0] ?? ""}`.toUpperCase()
    : "";

  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const visibleItems = SIDEBAR_NAV_ITEMS.filter((item) => {
    const requiredPermission = ROUTE_PERMISSIONS[item.href];
    if (!requiredPermission) return true;
    return hasPermission(requiredPermission);
  });

  return (
    <aside className="hidden w-64 h-screen bg-sidebar-bg border-e border-border md:flex flex-col shrink-0 sticky top-0">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="w-9 h-9 bg-foreground rounded-lg flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="text-base font-bold text-foreground">
            CarImport DZ
          </span>
          <p className="text-[10px] text-muted">ERP v2.0</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {visibleItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                    ${
                      active
                        ? "bg-sidebar-active-bg text-sidebar-active-text"
                        : "text-foreground hover:bg-sidebar-hover-bg"
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

      <div className="px-3 py-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-status-blue-bg flex items-center justify-center text-[10px] font-bold text-status-blue-text">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {currentUser?.firstName} {currentUser?.lastName}
            </p>
            <p className="text-[11px] text-muted truncate">
              {currentUser?.roles[0]?.name ?? "Utilisateur"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
