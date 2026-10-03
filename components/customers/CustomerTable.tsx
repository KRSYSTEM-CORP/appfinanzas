"use client";

import { useMemo, useState, useTransition } from "react";
import { SearchIcon, UsersIcon } from "lucide-react";
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
import { MasterDetail } from "@/components/shared/MasterDetail";
import { deleteCustomer } from "@/lib/actions/customers";

export function CustomerTable({ customers, canManage }: { customers: Customer[]; canManage: boolean }) {
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
      <div className="relative max-w-sm">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Buscar clientes por nombre o teléfono"
          placeholder="Buscar por nombre o teléfono..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>
      <MasterDetail
        items={filtered}
        label="Clientes"
        renderRow={(c) => (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {`${c.firstName[0] ?? ""}${c.lastName[0] ?? ""}`.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {c.firstName} {c.lastName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{c.phone}</span>
            </span>
            <span className="hidden max-w-[11rem] truncate text-xs text-muted-foreground lg:block">
              {c.address ?? ""}
            </span>
          </>
        )}
        renderDetail={(c) => (
          <>
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {`${c.firstName[0] ?? ""}${c.lastName[0] ?? ""}`.toUpperCase()}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold leading-tight">
                  {c.firstName} {c.lastName}
                </h3>
                <p className="text-sm text-muted-foreground">{c.phone}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Teléfono</dt>
                <dd className="font-medium">{c.phone}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Cédula/RIF</dt>
                <dd className="font-medium">{c.rif ?? "—"}</dd>
              </div>
              <div className="col-span-2 flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Dirección</dt>
                <dd className="font-medium">{c.address ?? "—"}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button variant="outline" nativeButton={false} render={<Link href={`/customers/${c.id}/crm`} />}>
                CRM
              </Button>
              {canManage && (
                <Button variant="outline" nativeButton={false} render={<Link href={`/customers/${c.id}`} />}>
                  Editar
                </Button>
              )}
              {canManage && (
                <Dialog>
                  <DialogTrigger render={<Button variant="destructive" className="ml-auto" />}>Eliminar</DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>¿Eliminar cliente?</DialogTitle>
                      <DialogDescription>
                        Se eliminará {c.firstName} {c.lastName} de tu lista de clientes. Las ventas ya
                        realizadas conservarán sus datos, pero no podrás autocompletarlos en una próxima
                        compra.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                      <DialogClose
                        render={<Button variant="destructive" disabled={isPending} />}
                        onClick={() => handleDelete(c.id)}
                      >
                        Eliminar
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </>
        )}
        empty={
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-14 text-center shadow-xs">
            <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
              <UsersIcon className="size-5" />
            </div>
            <p className="text-sm text-muted-foreground">No se encontraron clientes.</p>
          </div>
        }
      />
      <div className="md:hidden rounded-lg border bg-card shadow-xs overflow-x-auto">
        <Table className="table-cards">
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
                <TableCell data-label="Nombre" className="font-medium">
                  {c.firstName} {c.lastName}
                </TableCell>
                <TableCell data-label="Teléfono">{c.phone}</TableCell>
                <TableCell data-label="Dirección">{c.address ?? "—"}</TableCell>
                <TableCell data-label="Acciones" className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`/customers/${c.id}/crm`} />}
                    >
                      CRM
                    </Button>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        nativeButton={false}
                        render={<Link href={`/customers/${c.id}`} />}
                      >
                        Editar
                      </Button>
                    )}
                    {canManage && (
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
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-0">
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
                      <UsersIcon className="size-5" />
                    </div>
                    <p className="text-sm text-muted-foreground">No se encontraron clientes.</p>
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
