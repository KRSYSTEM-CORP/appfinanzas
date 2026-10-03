"use client";

import { useState, type ReactNode } from "react";

// Desktop-only "list + detail panel" layout shared by Clientes and
// Proveedores: a compact list on the left and the selected item's details and
// actions in a sticky panel on the right. Each screen decides what a row and
// the panel contain; this only owns the selection and the layout. Phones keep
// their own card list (this renders nothing below md).
export function MasterDetail<T extends { id: string }>({
  items,
  label,
  renderRow,
  renderDetail,
  renderLead,
  header,
  empty,
}: {
  items: T[];
  label: string;
  renderRow: (item: T) => ReactNode;
  renderDetail: (item: T) => ReactNode;
  // Optional control shown beside each row (e.g. a checkbox) — a sibling of
  // the row button, never nested inside it.
  renderLead?: (item: T) => ReactNode;
  // Optional strip above the list (e.g. "select all").
  header?: ReactNode;
  empty: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (items.length === 0) {
    return <div className="hidden md:block">{empty}</div>;
  }

  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  return (
    <div className="hidden md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 items-start">
      <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
        {header}
        <div role="listbox" aria-label={label}>
          {items.map((item) => {
            const active = item.id === selected.id;
            return (
              <div
                key={item.id}
                className={`flex items-center border-b last:border-b-0 transition-colors duration-150 ease-out ${
                  active ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted/60"
                }`}
              >
                {renderLead && <div className="shrink-0 pl-3.5">{renderLead(item)}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedId(item.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-left"
                >
                  {renderRow(item)}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <aside className="sticky top-4 flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-xs">
        {renderDetail(selected)}
      </aside>
    </div>
  );
}
