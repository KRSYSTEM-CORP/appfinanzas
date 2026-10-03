"use client";

import { useMemo, useState, useTransition } from "react";
import { SearchIcon, TruckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Supplier } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { deleteSupplier, setSupplierActive } from "@/lib/actions/suppliers";

export function SupplierTable({ suppliers }: { suppliers: Supplier[] }) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.rif ?? "").toLowerCase().includes(q)
    );
  }, [suppliers, query]);

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteSupplier(id);
      if (!result.success) setError(result.error);
      router.refresh();
    });
  }

  function handleToggleActive(id: string, isActive: boolean) {
    startTransition(async () => {
      await setSupplierActive(id, isActive);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Buscar proveedores por nombre o RIF"
          placeholder="Buscar por nombre o RIF..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <MasterDetail
        items={filtered}
        label="Proveedores"
        renderRowMobile={(s) => (
          <MobileRow
            title={s.name}
            meta={[s.rif, s.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
            badge={<Badge variant={s.isActive ? "success" : "outline"}>{s.isActive ? "Activo" : "Inactivo"}</Badge>}
          />
        )}
        renderRow={(s) => (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
              <TruckIcon className="size-4 text-muted-foreground/60" />
            </span>
            <span className={`min-w-0 flex-1 ${s.isActive ? "" : "opacity-60"}`}>
              <span className="block truncate text-sm font-semibold">{s.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {[s.rif, s.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
              </span>
            </span>
            <Badge variant={s.isActive ? "success" : "outline"}>{s.isActive ? "Activo" : "Inactivo"}</Badge>
          </>
        )}
        renderDetail={(s) => (
          <>
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-muted">
                <TruckIcon className="size-6 text-muted-foreground/60" />
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold leading-tight">{s.name}</h3>
                <p className="text-sm text-muted-foreground">{s.rif ?? "Sin RIF"}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">RIF</dt>
                <dd className="font-medium">{s.rif ?? "—"}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Teléfono</dt>
                <dd className="font-medium">{s.phone ?? "—"}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Estado</dt>
                <dd>
                  <Badge variant={s.isActive ? "success" : "outline"}>{s.isActive ? "Activo" : "Inactivo"}</Badge>
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button nativeButton={false} render={<Link href={`/suppliers/${s.id}`} />}>
                Editar proveedor
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleToggleActive(s.id, !s.isActive)}
              >
                {s.isActive ? "Desactivar" : "Activar"}
              </Button>
              <Dialog>
                <DialogTrigger render={<Button variant="destructive" className="ml-auto" />}>Eliminar</DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>¿Eliminar proveedor?</DialogTitle>
                    <DialogDescription>
                      Se eliminará {s.name} de tu lista de proveedores. Si tiene compras registradas, no
                      podrá eliminarse — desactívalo en su lugar.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                    <DialogClose
                      render={<Button variant="destructive" disabled={isPending} />}
                      onClick={() => handleDelete(s.id)}
                    >
                      Eliminar
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </>
        )}
        empty={
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-14 text-center shadow-xs">
            <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
              <TruckIcon className="size-5" />
            </div>
            <p className="text-sm text-muted-foreground">No se encontraron proveedores.</p>
          </div>
        }
      />
    </div>
  );
}
