"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { User, UserStatus, Role, Branch } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  createEmployee,
  updateEmployee,
  setEmployeeStatus,
  deleteEmployee,
} from "@/lib/actions/employees";

const ROLE_LABELS: Record<Role, string> = { GERENTE: "Gerente", VENDEDOR: "Vendedor" };
const STATUS_LABELS: Record<UserStatus, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
};

function displayName(u: Pick<User, "firstName" | "lastName" | "email">): string {
  return u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email;
}

export function EmployeeTable({
  employees,
  currentUserId,
  branches,
}: {
  employees: User[];
  currentUserId: string;
  branches: Branch[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("VENDEDOR");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [createError, setCreateError] = useState<string | null>(null);

  function handleCreate(e: React.MouseEvent) {
    e.preventDefault();
    setCreateError(null);
    const formData = new FormData();
    formData.set("firstName", firstName);
    formData.set("lastName", lastName);
    formData.set("password", password);
    formData.set("role", role);
    formData.set("branchId", branchId);
    startTransition(async () => {
      const result = await createEmployee(formData);
      if (!result.success) {
        setCreateError(result.error);
        return;
      }
      setFirstName("");
      setLastName("");
      setPassword("");
      setRole("VENDEDOR");
      setBranchId(branches[0]?.id ?? "");
      setCreateOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button disabled={isPending} />}>Nuevo empleado</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo empleado</DialogTitle>
              <DialogDescription>
                Entrará con el código de empresa, su nombre, apellido y esta contraseña.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="new-firstName">Nombre</Label>
                  <Input id="new-firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="new-lastName">Apellido</Label>
                  <Input id="new-lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password">Contraseña</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-role">Rol</Label>
                <Select value={role} onValueChange={(v) => v && setRole(v as Role)}>
                  <SelectTrigger id="new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                    <SelectItem value="GERENTE">Gerente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {role === "VENDEDOR" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-branch">Sucursal</Label>
                  <Select value={branchId} onValueChange={(v) => v && setBranchId(v)}>
                    <SelectTrigger id="new-branch">
                      <SelectValue placeholder="Selecciona una sucursal">
                        {(value: string | null) => branches.find((b) => b.id === value)?.name ?? "Selecciona una sucursal"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button disabled={isPending} onClick={handleCreate}>
                Crear empleado
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
              <TableHead>Rol</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((u) => (
              <EmployeeRow key={u.id} user={u} currentUserId={currentUserId} branches={branches} />
            ))}
            {employees.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Aún no hay empleados registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EmployeeRow({
  user: u,
  currentUserId,
  branches,
}: {
  user: User;
  currentUserId: string;
  branches: Branch[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  const [firstName, setFirstName] = useState(u.firstName ?? "");
  const [lastName, setLastName] = useState(u.lastName ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(u.role);
  const [branchId, setBranchId] = useState(u.branchId ?? branches[0]?.id ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>, onError: (e: string | null) => void) {
    onError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        onError(result.error ?? "Ocurrió un error");
        return;
      }
      router.refresh();
    });
  }

  function handleEdit(e: React.MouseEvent) {
    e.preventDefault();
    setEditError(null);
    const formData = new FormData();
    formData.set("firstName", firstName);
    formData.set("lastName", lastName);
    formData.set("role", role);
    formData.set("password", password);
    formData.set("branchId", branchId);
    startTransition(async () => {
      const result = await updateEmployee(u.id, formData);
      if (!result.success) {
        setEditError(result.error);
        return;
      }
      setPassword("");
      setEditOpen(false);
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {displayName(u)}
        {u.id === currentUserId && (
          <Badge variant="outline" className="ml-2">
            Tú
          </Badge>
        )}
      </TableCell>
      <TableCell>{ROLE_LABELS[u.role]}</TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {u.branchId ? branches.find((b) => b.id === u.branchId)?.name ?? "—" : "Todas"}
      </TableCell>
      <TableCell>
        <Badge variant={u.status === "ACTIVE" ? "success" : "destructive"}>
          {STATUS_LABELS[u.status]}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{formatDate(u.createdAt)}</TableCell>
      <TableCell className="text-right">
        {statusError && <p className="text-sm text-destructive mb-1">{statusError}</p>}
        <div className="flex justify-end flex-wrap gap-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger render={<Button size="sm" variant="outline" disabled={isPending} />}>
              Editar
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar empleado</DialogTitle>
                <DialogDescription>
                  Deja la contraseña en blanco para no cambiarla.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Label htmlFor={`edit-firstName-${u.id}`}>Nombre</Label>
                    <Input
                      id={`edit-firstName-${u.id}`}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Label htmlFor={`edit-lastName-${u.id}`}>Apellido</Label>
                    <Input
                      id={`edit-lastName-${u.id}`}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`edit-password-${u.id}`}>Nueva contraseña (opcional)</Label>
                  <Input
                    id={`edit-password-${u.id}`}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`edit-role-${u.id}`}>Rol</Label>
                  <Select value={role} onValueChange={(v) => v && setRole(v as Role)}>
                    <SelectTrigger id={`edit-role-${u.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                      <SelectItem value="GERENTE">Gerente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {role === "VENDEDOR" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`edit-branch-${u.id}`}>Sucursal</Label>
                    <Select value={branchId} onValueChange={(v) => v && setBranchId(v)}>
                      <SelectTrigger id={`edit-branch-${u.id}`}>
                        <SelectValue placeholder="Selecciona una sucursal">
                          {(value: string | null) => branches.find((b) => b.id === value)?.name ?? "Selecciona una sucursal"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {editError && <p className="text-sm text-destructive">{editError}</p>}
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                <Button disabled={isPending} onClick={handleEdit}>
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {u.status === "ACTIVE" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || u.id === currentUserId}
              onClick={() => run(() => setEmployeeStatus(u.id, "SUSPENDED"), setStatusError)}
            >
              Suspender
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => run(() => setEmployeeStatus(u.id, "ACTIVE"), setStatusError)}
            >
              Reactivar
            </Button>
          )}

          <Dialog>
            <DialogTrigger
              render={<Button size="sm" variant="destructive" disabled={isPending || u.id === currentUserId} />}
            >
              Eliminar
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>¿Eliminar a {displayName(u)}?</DialogTitle>
                <DialogDescription>
                  Esta acción es irreversible. Sus ventas y presupuestos pasados conservarán su
                  nombre, pero ya no podrá iniciar sesión.
                </DialogDescription>
              </DialogHeader>
              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                <DialogClose
                  render={<Button variant="destructive" disabled={isPending} />}
                  onClick={() => run(() => deleteEmployee(u.id), setDeleteError)}
                >
                  Eliminar
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
