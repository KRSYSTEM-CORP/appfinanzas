"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LOCK_MINUTE_CHOICES, PERMISSIONS } from "@/lib/permissions";
import { assignRole, createRole, deleteRole, updateRoleLockMinutes, updateRolePermissions, type RoleRow } from "@/lib/actions/roles";
import { setUserPin } from "@/lib/actions/pin";
import type { EmployeeListItem } from "@/lib/actions/employees";
import { Field, FieldInput, FieldSelect, PermGrid, SubTitle, displayName } from "@/components/settings/team-print-kit";

// Hoja «Gestionar» de una persona (preview: rol + permisos + Guardar / Restablecer clave / Cancelar).
// Los permisos pertenecen al rol: editarlos aquí los cambia para todas las personas con ese rol.
export function ManageUserSheet({
  person,
  roles,
  open,
  onOpenChange,
  pinLocked,
}: {
  person: EmployeeListItem;
  roles: RoleRow[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pinLocked: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initialRole = person.roleId ?? roles.find((r) => r.baseRole === person.role && r.isSystem)?.id ?? roles[0]?.id ?? "";
  const [roleId, setRoleId] = useState(initialRole);
  const role = roles.find((r) => r.id === roleId);
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const perms = edits[roleId] ?? role?.permissions ?? [];
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const name = displayName(person);

  function save() {
    start(async () => {
      if (roleId && roleId !== person.roleId) {
        const r = await assignRole(person.id, roleId);
        if (!r.success) {
          toast.error(r.error);
          return;
        }
      }
      if (role && edits[roleId] && role.name !== "Dueño") {
        const r = await updateRolePermissions(role.id, edits[roleId]);
        if (!r.success) {
          toast.error(r.error);
          return;
        }
      }
      toast.success("Permisos actualizados");
      onOpenChange(false);
      router.refresh();
    });
  }

  function savePin(next: string | null) {
    start(async () => {
      const r = await setUserPin(person.id, next);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(next ? `PIN de ${name} guardado.` : `PIN de ${name} quitado.`);
      setPin("");
      setPinOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>Elige a qué tiene autorización</DialogDescription>
        </DialogHeader>
        <div>
          <Field label="Rol" htmlFor="ue-r">
            <FieldSelect id="ue-r" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </FieldSelect>
          </Field>
          <PermGrid
            items={PERMISSIONS}
            selected={perms}
            disabled={role?.name === "Dueño"}
            onToggle={(id) => setEdits((cur) => ({ ...cur, [roleId]: perms.includes(id) ? perms.filter((p) => p !== id) : [...perms, id] }))}
          />
          <p className="mt-2 text-[13px] text-muted-foreground">Los permisos son del rol: se aplican a todas las personas que lo tienen.</p>
        </div>
        {pinOpen && (
          <div>
            <Field label="Nuevo PIN (4 dígitos)" htmlFor="ue-pin">
              <FieldInput
                id="ue-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button type="button" disabled={pending || pin.length !== 4} onClick={() => savePin(pin)}>
                Guardar PIN
              </Button>
              {person.hasPin && (
                <Button type="button" variant="outline" disabled={pending} onClick={() => savePin(null)}>
                  Quitar PIN
                </Button>
              )}
            </div>
          </div>
        )}
        {pinLocked && pinOpen && <p className="text-[13px] text-muted-foreground">Disponible cuando un gerente tenga PIN.</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button type="button" disabled={pending} onClick={save}>
            Guardar
          </Button>
          <Button type="button" variant="outline" disabled={pending || pinLocked} onClick={() => setPinOpen((v) => !v)}>
            Restablecer clave
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hoja «Crear un rol nuevo».
export function NewRoleSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [baseRole, setBaseRole] = useState<"GERENTE" | "VENDEDOR">("VENDEDOR");
  const [picked, setPicked] = useState<string[]>(["inventory"]);

  function save() {
    start(async () => {
      if (!name.trim() || picked.length === 0) {
        toast.error("Escribe el nombre y elige al menos un permiso");
        return;
      }
      const r = await createRole({ name, baseRole, permissions: picked });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(`Rol creado: ${name.trim()}`);
      setName("");
      setPicked(["inventory"]);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear un rol nuevo</DialogTitle>
          <DialogDescription>Dale un nombre y elige a qué tendrá autorización</DialogDescription>
        </DialogHeader>
        <div>
          <Field label="Nombre del rol" htmlFor="rn-n">
            <FieldInput id="rn-n" placeholder="Ej: Encargado de almacén" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Entra como">
            <Segmented
              label="Entra como"
              value={baseRole}
              onChange={setBaseRole}
              options={[
                { value: "VENDEDOR", label: "Vendedor" },
                { value: "GERENTE", label: "Gerente" },
              ]}
            />
          </Field>
          <PermGrid
            items={PERMISSIONS}
            selected={picked}
            onToggle={(id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button type="button" disabled={pending} onClick={save}>
            Guardar rol
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// «Minutos de inactividad por rol»: una fila por rol con el segmentado de minutos.
export function RoleLockRows({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function setMinutes(role: RoleRow, minutes: number) {
    start(async () => {
      const r = await updateRoleLockMinutes(role.id, minutes);
      if (!r.success) toast.error(r.error);
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
    <>
      <SubTitle className="mt-3">Minutos de inactividad por rol</SubTitle>
      {roles.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2.5 border-b border-border py-2.5 last:border-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <b className="font-bold">{r.name}</b>
            {!r.isSystem && r.users === 0 && (
              <button type="button" disabled={pending} aria-label={`Eliminar el rol ${r.name}`} onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive">
                <Trash2Icon className="size-3.5" />
              </button>
            )}
          </div>
          <Segmented
            label={`Minutos de bloqueo · ${r.name}`}
            value={String(r.lockMinutes)}
            onChange={(v) => setMinutes(r, Number(v))}
            options={LOCK_MINUTE_CHOICES.map((m) => ({ value: String(m), label: `${m} min` }))}
          />
        </div>
      ))}
    </>
  );
}
