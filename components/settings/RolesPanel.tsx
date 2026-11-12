"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PERMISSIONS } from "@/lib/permissions";
import { assignRole, createRole, deleteRole, updateRolePermissions, type RoleRow } from "@/lib/actions/roles";

// Matriz de roles y permisos (Ajustes → Equipo y Seguridad): una fila por permiso, una columna por rol.
export function RolesMatrix({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseRole, setBaseRole] = useState<"GERENTE" | "VENDEDOR">("VENDEDOR");
  const [picked, setPicked] = useState<string[]>(["pos"]);

  function toggle(role: RoleRow, permission: string) {
    const next = role.permissions.includes(permission) ? role.permissions.filter((p) => p !== permission) : [...role.permissions, permission];
    start(async () => {
      const r = await updateRolePermissions(role.id, next);
      if (!r.success) toast.error(r.error);
      router.refresh();
    });
  }

  function create() {
    start(async () => {
      const r = await createRole({ name, baseRole, permissions: picked });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      setOpen(false);
      setName("");
      setPicked(["pos"]);
      router.refresh();
    });
  }

  function remove(role: RoleRow) {
    start(async () => {
      const r = await deleteRole(role.id);
      if (!r.success) toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)" aria-label="Roles y permisos">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">Roles y permisos</h3>
          <p className="text-sm text-muted-foreground">Edita lo que puede hacer cada rol. Los permisos se validan también en el servidor.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <PlusIcon /> Crear un rol nuevo
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs">
              <th className="py-2 pr-3 font-bold">Permiso</th>
              {roles.map((r) => (
                <th key={r.id} className="px-2 text-center font-bold">
                  <span className="inline-flex items-center gap-1">
                    {r.name}
                    {!r.isSystem && (
                      <button type="button" aria-label={`Eliminar el rol ${r.name}`} onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive">
                        <Trash2Icon className="size-3.5" />
                      </button>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {PERMISSIONS.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-3">{p.label}</td>
                {roles.map((r) => (
                  <td key={r.id} className="px-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${p.label} · ${r.name}`}
                      checked={r.permissions.includes(p.id)}
                      disabled={pending || r.name === "Dueño"}
                      onChange={() => toggle(r, p.id)}
                      className="size-4 accent-[var(--primary)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear un rol nuevo</DialogTitle>
            <DialogDescription>Elige un nombre, si entra como gerente o vendedor y sus permisos.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Nombre del rol" placeholder="Nombre del rol" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <Chip active={baseRole === "VENDEDOR"} onClick={() => setBaseRole("VENDEDOR")}>Entra como vendedor</Chip>
            <Chip active={baseRole === "GERENTE"} onClick={() => setBaseRole("GERENTE")}>Entra como gerente</Chip>
          </div>
          <div className="flex flex-col gap-1.5">
            {PERMISSIONS.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(p.id)}
                  onChange={() => setPicked((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
                  className="size-4 accent-[var(--primary)]"
                />
                {p.label}
              </label>
            ))}
          </div>
          <Button type="button" size="lg" disabled={pending || name.trim().length < 2} onClick={create}>
            Crear rol
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// Selector del rol de una persona (en la lista de Equipo y PIN).
export function RoleSelect({ userId, roleId, roles }: { userId: string; roleId: string | null; roles: RoleRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Rol"
      value={roleId ?? ""}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          const r = await assignRole(userId, e.target.value || null);
          if (!r.success) toast.error(r.error);
          router.refresh();
        })
      }
      className="h-9 rounded-[12px] border-[1.5px] bg-background px-2 text-xs font-semibold"
    >
      <option value="">Sin rol (acceso anterior)</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
