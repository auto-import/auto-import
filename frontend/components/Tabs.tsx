'use client';

import type { TabItem } from '@/types';

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export default function Tabs({ tabs, activeTab, onTabChange }: TabsProps) {
  return (
    <div className="flex border-b border-border gap-0 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`
              relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors
              ${isActive
                ? 'text-foreground'
                : 'text-muted hover:text-foreground'
              }
            `}
          >
            {tab.label}
            {isActive && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
