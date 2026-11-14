"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreVerticalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type RowMenuItem = { label: string; onSelect?: () => void; href?: string; external?: boolean; danger?: boolean; disabled?: boolean };

// Menú ⋯ de las filas de la preview: botón circular de 36px sin fondo y lista flotante.
export function RowMenu({ items, label = "Más acciones" }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const itemCls = (danger?: boolean) =>
    cn("block w-full rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold hover:bg-muted disabled:opacity-50", danger ? "text-destructive" : "text-foreground");
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
      >
        <MoreVerticalIcon className="size-[18px]" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 min-w-48 rounded-[14px] bg-popover p-1.5 shadow-(--shadow-float)">
          {items.map((it) =>
            it.href ? (
              it.external ? (
                <a key={it.label} role="menuitem" href={it.href} target="_blank" rel="noopener noreferrer" className={itemCls(it.danger)} onClick={() => setOpen(false)}>
                  {it.label}
                </a>
              ) : (
                <Link key={it.label} role="menuitem" href={it.href} className={itemCls(it.danger)} onClick={() => setOpen(false)}>
                  {it.label}
                </Link>
              )
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={itemCls(it.danger)}
                onClick={() => {
                  setOpen(false);
                  it.onSelect?.();
                }}
              >
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
