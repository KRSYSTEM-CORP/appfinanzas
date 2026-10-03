"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVerticalIcon, UsersRoundIcon } from "lucide-react";
import type { UserStatus, Role, Branch } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMenu } from "@/components/ui/action-menu";
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
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { formatDate } from "@/lib/format";
import { joinFullName, splitFullName } from "@/lib/name";
import { APP_SECTIONS } from "@/lib/sections";
import {
  createEmployee,
  updateEmployee,
  setEmployeeStatus,
  deleteEmployee,
  type EmployeeListItem,
} from "@/lib/actions/employees";
import { MasterDetail } from "@/components/shared/MasterDetail";

const ROLE_LABELS: Record<Role, string> = { GERENTE: "Gerente", VENDEDOR: "Vendedor" };
const STATUS_LABELS: Record<UserStatus, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
};

function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? "").slice(0, 2).join("").toUpperCase();
}

function displayName(u: Pick<EmployeeListItem, "firstName" | "lastName" | "email">): string {
  return u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email;
}

// Only shown for VENDEDOR — a GERENTE always has full access, so there's
// nothing to restrict. An empty selection means "sin restricción" (todo
// permitido), not "sin acceso" — see requireSectionAccess, lib/session.ts.
function SectionAccessPicker({
  idPrefix,
  selected,
  onChange,
}: {
  idPrefix: string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Acceso a secciones</Label>
      <div className="grid grid-cols-2 gap-1.5 rounded-md border p-2">
        {APP_SECTIONS.map((s) => (
          <label key={s.id} htmlFor={`${idPrefix}-section-${s.id}`} className="flex items-center gap-2 text-sm">
            <input
              id={`${idPrefix}-section-${s.id}`}
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
            />
            {s.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Deja todo sin marcar para que tenga acceso a todo. Marca solo las secciones a las que sí
        debe entrar para restringir el resto.
      </p>
    </div>
  );
}

export function EmployeeTable({
  employees,
  currentUserId,
  branches,
}: {
  employees: EmployeeListItem[];
  currentUserId: string;
  branches: Branch[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("VENDEDOR");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [allowedSections, setAllowedSections] = useState<Set<string>>(new Set());
  const [createError, setCreateError] = useState<string | null>(null);

  function handleCreate(e: React.MouseEvent) {
    e.preventDefault();
    setCreateError(null);
    const { firstName, lastName } = splitFullName(fullName);
    const formData = new FormData();
    formData.set("firstName", firstName);
    formData.set("lastName", lastName);
    formData.set("password", password);
    formData.set("role", role);
    formData.set("branchId", branchId);
    for (const s of allowedSections) formData.append("allowedSections", s);
    startTransition(async () => {
      const result = await createEmployee(formData);
      if (!result.success) {
        setCreateError(result.error);
        return;
      }
      setFullName("");
      setPassword("");
      setRole("VENDEDOR");
      setBranchId(branches[0]?.id ?? "");
      setAllowedSections(new Set());
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
                Entrará con el código de empresa, su nombre de usuario y esta contraseña.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-fullName">Nombre de usuario</Label>
                <Input
                  id="new-fullName"
                  autoComplete="off"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Ej. Nombre y apellido</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password">Contraseña</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <PasswordRequirements password={password} />
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
              {role === "VENDEDOR" && (
                <SectionAccessPicker idPrefix="new" selected={allowedSections} onChange={setAllowedSections} />
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

      <MasterDetail
        items={employees}
        label="Empleados"
        renderRow={(u) => (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initialsOf(displayName(u))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {displayName(u)}
                {u.id === currentUserId && (
                  <Badge variant="outline" className="ml-2">
                    Tú
                  </Badge>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {ROLE_LABELS[u.role]} · {u.branchId ? (branches.find((b) => b.id === u.branchId)?.name ?? "—") : "Todas las sucursales"}
              </span>
            </span>
            <Badge variant={u.status === "ACTIVE" ? "success" : "destructive"}>{STATUS_LABELS[u.status]}</Badge>
          </>
        )}
        renderDetail={(u) => (
          <>
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {initialsOf(displayName(u))}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold leading-tight">
                  {displayName(u)}
                  {u.id === currentUserId && (
                    <Badge variant="outline" className="ml-2 align-middle">
                      Tú
                    </Badge>
                  )}
                </h3>
                <p className="truncate text-sm text-muted-foreground">{u.email}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Rol</dt>
                <dd className="font-medium">{ROLE_LABELS[u.role]}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Estado</dt>
                <dd>
                  <Badge variant={u.status === "ACTIVE" ? "success" : "destructive"}>{STATUS_LABELS[u.status]}</Badge>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Sucursal</dt>
                <dd className="font-medium">
                  {u.branchId ? (branches.find((b) => b.id === u.branchId)?.name ?? "—") : "Todas"}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Desde</dt>
                <dd className="font-medium">{formatDate(u.createdAt)}</dd>
              </div>
            </dl>
            <div className="border-t pt-4 [&_.justify-end]:justify-start text-left">
              <EmployeeActions user={u} currentUserId={currentUserId} branches={branches} />
            </div>
          </>
        )}
        empty={
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-14 text-center shadow-xs">
            <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
              <UsersRoundIcon className="size-5" />
            </div>
            <p className="text-sm font-medium">Aún no tienes empleados</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Crea el primer perfil para que tu equipo pueda iniciar sesión con el código de empresa.
            </p>
          </div>
        }
      />
      <div className="md:hidden rounded-lg border bg-card shadow-xs overflow-x-auto">
        <Table className="table-cards">
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
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="p-0">
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
                      <UsersRoundIcon className="size-5" />
                    </div>
                    <p className="text-sm font-medium">Aún no tienes empleados</p>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Crea el primer perfil para que tu equipo pueda iniciar sesión con el código de
                      empresa.
                    </p>
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

function EmployeeActions({
  user: u,
  currentUserId,
  branches,
}: {
  user: EmployeeListItem;
  currentUserId: string;
  branches: Branch[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  const [fullName, setFullName] = useState(joinFullName(u.firstName ?? "", u.lastName ?? ""));
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(u.role);
  const [branchId, setBranchId] = useState(u.branchId ?? branches[0]?.id ?? "");
  const [allowedSections, setAllowedSections] = useState<Set<string>>(new Set(u.allowedSections));
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
    const { firstName, lastName } = splitFullName(fullName);
    const formData = new FormData();
    formData.set("firstName", firstName);
    formData.set("lastName", lastName);
    formData.set("role", role);
    formData.set("password", password);
    formData.set("branchId", branchId);
    for (const s of allowedSections) formData.append("allowedSections", s);
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
    <div className="text-right">
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
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`edit-fullName-${u.id}`}>Nombre de usuario</Label>
                  <Input
                    id={`edit-fullName-${u.id}`}
                    autoComplete="off"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Ej. Nombre y apellido</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`edit-password-${u.id}`}>Nueva contraseña (opcional)</Label>
                  <Input
                    id={`edit-password-${u.id}`}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {password && <PasswordRequirements password={password} />}
                  {!password && (
                    <p className="text-xs text-muted-foreground">
                      Déjala en blanco para no cambiarla.
                    </p>
                  )}
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
                {role === "VENDEDOR" && (
                  <SectionAccessPicker
                    idPrefix={`edit-${u.id}`}
                    selected={allowedSections}
                    onChange={setAllowedSections}
                  />
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

          <ActionMenu
            trigger={
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={isPending}
                aria-label={`Más acciones para ${displayName(u)}`}
              />
            }
            triggerChildren={<MoreVerticalIcon />}
            contentClassName="w-48"
          >
            {u.status === "ACTIVE" ? (
              <button
                type="button"
                disabled={isPending || u.id === currentUserId}
                onClick={() => run(() => setEmployeeStatus(u.id, "SUSPENDED"), setStatusError)}
                className="px-2.5 py-2 text-sm rounded-md text-left hover:bg-muted transition-colors disabled:opacity-50"
              >
                Suspender
              </button>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => setEmployeeStatus(u.id, "ACTIVE"), setStatusError)}
                className="px-2.5 py-2 text-sm rounded-md text-left hover:bg-muted transition-colors disabled:opacity-50"
              >
                Reactivar
              </button>
            )}
            <Dialog>
              <DialogTrigger
                render={
                  <button
                    type="button"
                    disabled={isPending || u.id === currentUserId}
                    className="px-2.5 py-2 text-sm rounded-md text-left text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  />
                }
              >
                Eliminar
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>¿Eliminar a {displayName(u)}?</DialogTitle>
                  <DialogDescription>
                    Esta acción es irreversible. Sus ventas y presupuestos pasados conservarán
                    su nombre, pero ya no podrá iniciar sesión.
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
          </ActionMenu>
        </div>
    </div>
  );
}

function EmployeeRow({
  user: u,
  currentUserId,
  branches,
}: {
  user: EmployeeListItem;
  currentUserId: string;
  branches: Branch[];
}) {
  return (
    <TableRow>
      <TableCell data-label="Nombre" className="font-medium">
        {displayName(u)}
        {u.id === currentUserId && (
          <Badge variant="outline" className="ml-2">
            Tú
          </Badge>
        )}
      </TableCell>
      <TableCell data-label="Rol">{ROLE_LABELS[u.role]}</TableCell>
      <TableCell data-label="Sucursal" className="text-muted-foreground text-sm">
        {u.branchId ? branches.find((b) => b.id === u.branchId)?.name ?? "—" : "Todas"}
      </TableCell>
      <TableCell data-label="Estado">
        <Badge variant={u.status === "ACTIVE" ? "success" : "destructive"}>
          {STATUS_LABELS[u.status]}
        </Badge>
      </TableCell>
      <TableCell data-label="Desde" className="text-muted-foreground text-sm">{formatDate(u.createdAt)}</TableCell>
      <TableCell data-label="Acciones" className="text-right">
        <EmployeeActions user={u} currentUserId={currentUserId} branches={branches} />
      </TableCell>
    </TableRow>
  );
}

