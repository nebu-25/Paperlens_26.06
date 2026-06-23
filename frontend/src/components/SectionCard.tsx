import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function SectionCard({
  title,
  icon,
  action,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded border border-line bg-white p-4">
      <div className={`flex items-center justify-between gap-3 ${open ? 'mb-3' : ''}`}>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <ChevronDown
            size={14}
            className={`shrink-0 text-muted transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </h3>
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}
