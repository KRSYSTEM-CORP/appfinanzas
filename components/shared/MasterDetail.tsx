"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon, XIcon } from "lucide-react";

// Shared "list + detail" layout.
// - Desktop (md and up): a compact list on the left and the selected item's
//   details and actions in a sticky panel on the right.
// - Phones: a compact two-line list; tapping a row opens the same details and
//   actions in a bottom sheet.
// Each screen decides what a row and the details contain; this only owns the
// selection and the layout. The sheet is deliberately a plain fixed panel (not
// a modal drawer library) portaled to <body> so no ancestor stacking context
// can put the tab bar above it: the details embed their own dialogs, menus and
// selects, which portal to <body> and must keep working on top of it.
export function MasterDetail<T extends { id: string }>({
  items,
  label,
  renderRow,
  renderRowMobile,
  renderDetail,
  renderLead,
  header,
  footer,
  empty,
}: {
  items: T[];
  label: string;
  renderRow: (item: T) => ReactNode;
  // Phone-width row content (defaults to renderRow, which is built for the
  // wider desktop list).
  renderRowMobile?: (item: T) => ReactNode;
  renderDetail: (item: T) => ReactNode;
  // Optional control shown beside each row (e.g. a checkbox) — a sibling of
  // the row button, never nested inside it.
  renderLead?: (item: T) => ReactNode;
  // Optional strip above the list (e.g. "select all").
  header?: ReactNode;
  // Optional strip below the list (e.g. period totals).
  footer?: ReactNode;
  empty: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // The sheet shows exactly the tapped item; if it disappears (e.g. it was
  // deleted from inside the sheet) the sheet closes by itself.
  const sheetItem = sheetOpen ? items.find((i) => i.id === selectedId) : undefined;
  const sheetShown = sheetItem !== undefined;

  // Drag the grip row down to dismiss: the panel follows the finger 1:1 and a
  // quick flick closes it even when it didn't travel far.
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null);

  function dragStart(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is only an optimisation; dragging still works without it.
    }
    drag.current = { startY: e.clientY, startT: e.timeStamp, dy: 0 };
    if (panelRef.current) panelRef.current.style.transition = "none";
  }
  function dragMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    if (panelRef.current) panelRef.current.style.transform = `translateY(${d.dy}px)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, 1 - d.dy / 400));
  }
  function dragEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const velocity = d.dy / Math.max(1, e.timeStamp - d.startT);
    if (d.dy > 120 || (d.dy > 24 && velocity > 0.5)) {
      setSheetOpen(false);
      return;
    }
    if (panelRef.current) {
      panelRef.current.style.transition = "transform 220ms var(--ease-ui)";
      panelRef.current.style.transform = "";
    }
    if (scrimRef.current) scrimRef.current.style.opacity = "";
  }

  useEffect(() => {
    if (!sheetShown) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sheetShown]);

  if (items.length === 0) {
    return <>{empty}</>;
  }

  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  return (
    <>
      {/* Phones: compact list */}
      <div className="md:hidden overflow-hidden rounded-lg border bg-card shadow-xs">
        {header}
        <div role="listbox" aria-label={label}>
          {items.map((item) => (
            <div key={item.id} className="flex items-center border-b last:border-b-0">
              {renderLead && <div className="shrink-0 pl-3">{renderLead(item)}</div>}
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  setSelectedId(item.id);
                  setSheetOpen(true);
                }}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors duration-150 ease-out active:bg-muted/60"
              >
                {(renderRowMobile ?? renderRow)(item)}
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        {footer}
      </div>

      {sheetItem && createPortal(
        <div className="md:hidden fixed inset-0 z-[45]">
          <div ref={scrimRef} className="sheet-fade absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            className="sheet-in absolute bottom-0 left-0 right-0 flex max-h-[88dvh] flex-col rounded-t-2xl border-t bg-popover text-popover-foreground shadow-2xl"
          >
            <div
              className="flex touch-none items-center justify-between px-4 pt-3"
              onPointerDown={dragStart}
              onPointerMove={dragMove}
              onPointerUp={dragEnd}
              onPointerCancel={dragEnd}
            >
              <span className="h-1.5 w-10 rounded-full bg-muted-foreground/25" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Cerrar"
                className="flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
              {renderDetail(sheetItem)}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Desktop: list + sticky panel */}
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
          {footer}
        </div>
        <aside className="sticky top-4 flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-xs">
          {renderDetail(selected)}
        </aside>
      </div>
    </>
  );
}

// Two-line phone row: title and amount on top, meta and an optional badge
// underneath. The same shape for every screen so the lists read alike.
export function MobileRow({
  title,
  meta,
  badge,
  amount,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  amount?: ReactNode;
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-semibold">{title}</span>
        <span className="flex min-w-0 items-center gap-2">
          {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
          {badge}
        </span>
      </span>
      {amount && <span className="flex shrink-0 justify-end text-sm">{amount}</span>}
    </>
  );
}
