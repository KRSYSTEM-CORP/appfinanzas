"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StoreIcon } from "lucide-react";
import type { Branch } from "@prisma/client";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

      <MasterDetail
        items={branches}
        label="Sucursales"
        empty={
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-14 text-center shadow-xs">
            <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
              <StoreIcon className="size-5" />
            </div>
            <p className="text-sm font-medium">Aún no tienes sucursales</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Cada sucursal tiene su propio inventario y su propia caja.
            </p>
          </div>
        }
        renderRowMobile={(b) => (
          <MobileRow
            title={b.name}
            meta={`Desde ${formatDate(b.createdAt)}`}
            badge={<Badge variant={b.isActive ? "success" : "destructive"}>{b.isActive ? "Activa" : "Inactiva"}</Badge>}
          />
        )}
        renderRow={(b) => (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
              <StoreIcon className="size-4 text-muted-foreground/60" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{b.name}</span>
              <span className="block truncate text-xs text-muted-foreground">Desde {formatDate(b.createdAt)}</span>
            </span>
            <Badge variant={b.isActive ? "success" : "destructive"}>{b.isActive ? "Activa" : "Inactiva"}</Badge>
          </>
        )}
        renderDetail={(b) => <BranchDetail key={b.id} branch={b} />}
      />
    </div>
  );
}

function BranchDetail({ branch: b }: { branch: Branch }) {
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
    <>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-lg font-semibold leading-tight">{b.name}</h3>
        <p className="text-sm text-muted-foreground">Desde {formatDate(b.createdAt)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Estado</dt>
          <dd>
            <Badge variant={b.isActive ? "success" : "destructive"}>{b.isActive ? "Activa" : "Inactiva"}</Badge>
          </dd>
        </div>
      </dl>
      {editError && <p className="text-sm text-destructive">{editError}</p>}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger render={<Button variant="outline" disabled={isPending} />}>Renombrar</DialogTrigger>
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

        <Button variant="outline" disabled={isPending} onClick={handleToggleActive}>
          {b.isActive ? "Desactivar" : "Activar"}
        </Button>
      </div>
    </>
  );
}
