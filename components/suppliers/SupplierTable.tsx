"use client";

import { useMemo, useState, useTransition } from "react";
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
      <Input
        placeholder="Buscar por nombre o RIF..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
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
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.rif ?? "—"}</TableCell>
                <TableCell>{s.phone ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={s.isActive ? "success" : "outline"}>
                    {s.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
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
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No se encontraron proveedores.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
