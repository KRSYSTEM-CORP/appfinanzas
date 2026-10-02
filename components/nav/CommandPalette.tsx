"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type PaletteItem = { href: string; label: string; group: string };

const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Navigation only: it lists exactly the links the sidebar already shows for
// this user's role/sections, so it can never offer a screen the menu hides.
export function CommandPalette({
  items,
  open,
  onOpenChange,
}: {
  items: PaletteItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    return q ? items.filter((i) => normalize(i.label).includes(q)) : items;
  }, [items, query]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setActive(0);
    }
    onOpenChange(next);
  }

  function go(item: PaletteItem) {
    handleOpenChange(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-md">
        <DialogTitle className="sr-only">Buscar pantalla</DialogTitle>
        <DialogDescription className="sr-only">
          Escribe para filtrar las pantallas, usa las flechas para moverte y Enter para ir.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Ir a una pantalla…"
            aria-label="Buscar pantalla"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            className="border-0 bg-transparent px-0 focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div id="command-palette-list" role="listbox" className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No hay pantallas que coincidan con &quot;{query}&quot;. Prueba con otra palabra, por
              ejemplo &quot;ventas&quot; o &quot;clientes&quot;.
            </p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.href}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 pointer-coarse:py-3 text-left text-sm ${
                  i === active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <span>{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.group}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
