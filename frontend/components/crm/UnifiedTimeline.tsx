"use client";

import {
  Calendar,
  MessageSquare,
  Phone,
  StickyNote,
  CheckSquare,
} from "lucide-react";
import type { TimelineItem } from "@/lib/crm-api";

const icons: Record<string, React.ReactNode> = {
  CALL: <Phone className="h-4 w-4" />,
  WHATSAPP: <MessageSquare className="h-4 w-4" />,
  NOTE: <StickyNote className="h-4 w-4" />,
  FOLLOW_UP: <CheckSquare className="h-4 w-4" />,
  APPOINTMENT: <Calendar className="h-4 w-4" />,
};

export default function UnifiedTimeline({
  items,
  emptyMessage = "Aucun événement.",
}: {
  items: TimelineItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0)
    return (
      <p className="py-8 text-center text-sm text-muted">{emptyMessage}</p>
    );
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="flex gap-3 rounded-card border border-border p-3"
        >
          <div className="mt-0.5 rounded-full bg-surface p-2">
            {icons[item.type] ?? <StickyNote className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{item.title}</p>
              <time className="text-xs text-muted">
                {new Date(item.occurredAt).toLocaleString("fr-FR")}
              </time>
            </div>
            {item.description && (
              <p className="mt-1 text-sm text-muted">{item.description}</p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
