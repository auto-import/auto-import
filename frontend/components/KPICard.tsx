'use client';

import { ReactNode } from 'react';

interface KPICardProps {
  label: string;
  value: string | number;
  subItems?: { label: string; value: string | number }[];
  icon?: ReactNode;
}

export default function KPICard({ label, value, subItems, icon }: KPICardProps) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <span className="text-2xl font-bold text-foreground">{value}</span>
      {subItems && subItems.length > 0 && (
        <div className="flex gap-4 mt-1">
          {subItems.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted">
              <span>{item.label}:</span>
              <span className="font-semibold text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
