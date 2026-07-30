"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Branch } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatDate } from "@/lib/format";
import { createBranch, updateBranch } from "@/lib/actions/branches";

export function BranchesForm({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(e: React.MouseEvent) {
    e.preventDefault();
    setCreateError(null);
    const formData = new FormData();
    formData.set("name", name);
    startTransition(async () => {
      const result = await createBranch(formData);
      if (!result.success) {
        setCreateError(result.error);
        return;
      }
      setName("");
      setCreateOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button disabled={isPending} />}>Nueva sucursal</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva sucursal</DialogTitle>
              <DialogDescription>
                Tendrá su propio catálogo de inventario y su propia caja, independientes de las
                demás sucursales.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-branch-name">Nombre</Label>
                <Input id="new-branch-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button disabled={isPending} onClick={handleCreate}>
                Crear sucursal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((b) => (
              <BranchRow key={b.id} branch={b} />
            ))}
            {branches.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Aún no hay sucursales.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function BranchRow({ branch: b }: { branch: Branch }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(b.name);
  const [editError, setEditError] = useState<string | null>(null);

  function handleEdit(e: React.MouseEvent) {
    e.preventDefault();
    setEditError(null);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("isActive", "true");
    startTransition(async () => {
      const result = await updateBranch(b.id, formData);
      if (!result.success) {
        setEditError(result.error);
        return;
      }
      setEditOpen(false);
      router.refresh();
    });
  }

  function handleToggleActive() {
    setEditError(null);
    const formData = new FormData();
    formData.set("name", b.name);
    formData.set("isActive", (!b.isActive).toString());
    startTransition(async () => {
      const result = await updateBranch(b.id, formData);
      if (!result.success) {
        setEditError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{b.name}</TableCell>
      <TableCell>
        <Badge variant={b.isActive ? "success" : "destructive"}>
          {b.isActive ? "Activa" : "Inactiva"}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{formatDate(b.createdAt)}</TableCell>
      <TableCell className="text-right">
        {editError && <p className="text-sm text-destructive mb-1">{editError}</p>}
        <div className="flex justify-end flex-wrap gap-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger render={<Button size="sm" variant="outline" disabled={isPending} />}>
              Renombrar
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Renombrar sucursal</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`edit-branch-name-${b.id}`}>Nombre</Label>
                  <Input
                    id={`edit-branch-name-${b.id}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                <Button disabled={isPending} onClick={handleEdit}>
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button size="sm" variant="outline" disabled={isPending} onClick={handleToggleActive}>
            {b.isActive ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
