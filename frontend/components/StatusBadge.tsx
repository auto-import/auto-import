'use client';

interface StatusBadgeProps {
  variant: string;
  label: string;
  size?: 'sm' | 'md';
}

const VARIANT_CLASSES: Record<string, string> = {
  blue: 'bg-status-blue-bg text-status-blue-text border-status-blue-border',
  amber: 'bg-status-amber-bg text-status-amber-text border-status-amber-border',
  green: 'bg-status-green-bg text-status-green-text border-status-green-border',
  gray: 'bg-status-gray-bg text-status-gray-text border-status-gray-border',
  red: 'bg-status-red-bg text-status-red-text border-status-red-border',
};

const SIZE_CLASSES: Record<string, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
};

export default function StatusBadge({ variant, label, size = 'md' }: StatusBadgeProps) {
  const variantClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.gray;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      className={`inline-flex items-center rounded-badge border font-medium whitespace-nowrap ${variantClass} ${sizeClass}`}
    >
      {label}
    </span>
  );
}
