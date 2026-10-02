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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <div className="rounded-lg border bg-card shadow-xs overflow-x-auto">
        <Table className="table-cards">
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>RIF</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id} className={!s.isActive ? "opacity-50" : undefined}>
                <TableCell data-label="Nombre" className="font-medium">{s.name}</TableCell>
                <TableCell data-label="RIF">{s.rif ?? "—"}</TableCell>
                <TableCell data-label="Teléfono">{s.phone ?? "—"}</TableCell>
                <TableCell data-label="Estado">
                  <Badge variant={s.isActive ? "success" : "outline"}>
                    {s.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell data-label="Acciones" className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`/suppliers/${s.id}`} />}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleToggleActive(s.id, !s.isActive)}
                    >
                      {s.isActive ? "Desactivar" : "Activar"}
                    </Button>
                    <Dialog>
                      <DialogTrigger render={<Button size="sm" variant="destructive" />}>
                        Eliminar
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>¿Eliminar proveedor?</DialogTitle>
                          <DialogDescription>
                            Se eliminará {s.name} de tu lista de proveedores. Si tiene compras
                            registradas, no podrá eliminarse — desactívalo en su lugar.
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
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
                      <TruckIcon className="size-5" />
                    </div>
                    <p className="text-sm text-muted-foreground">No se encontraron proveedores.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
