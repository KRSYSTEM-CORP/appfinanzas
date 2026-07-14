"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Customer } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { deleteCustomer } from "@/lib/actions/customers";

export function CustomerTable({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.phone.includes(q)
    );
  }, [customers, query]);

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCustomer(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Buscar por nombre o teléfono..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {c.firstName} {c.lastName}
                </TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.address ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`/customers/${c.id}`} />}
                    >
                      Editar
                    </Button>
                    <Dialog>
                      <DialogTrigger render={<Button size="sm" variant="destructive" />}>
                        Eliminar
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>¿Eliminar cliente?</DialogTitle>
                          <DialogDescription>
                            Se eliminará {c.firstName} {c.lastName} de tu lista de clientes. Las
                            ventas ya realizadas conservarán sus datos, pero no podrás
                            autocompletarlos en una próxima compra.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose render={<Button variant="outline" />}>
                            Cancelar
                          </DialogClose>
                          <DialogClose
                            render={<Button variant="destructive" disabled={isPending} />}
                            onClick={() => handleDelete(c.id)}
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
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No se encontraron clientes.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
