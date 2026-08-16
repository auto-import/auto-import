'use client';

import { Bell } from 'lucide-react';

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-border bg-background sticky top-0 z-10">
      <div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {/* Notification bell */}
        <button className="relative p-2 rounded-button hover:bg-surface transition-colors">
          <Bell className="w-5 h-5 text-foreground" />
          <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-status-red-text rounded-full" />
        </button>
        {/* User avatar */}
        <div className="w-9 h-9 bg-foreground rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-white">AD</span>
        </div>
      </div>
    </header>
  );
}
