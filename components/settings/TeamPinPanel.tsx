"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, ShieldCheckIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ManageUserSheet, NewRoleSheet, RoleLockRows } from "@/components/settings/RolesPanel";
import { Field, FieldInput, FieldSelect, ListRow, PermGrid, SCard, SubTitle, TWO_COLS, displayName, initialsOf } from "@/components/settings/team-print-kit";
import { Switch } from "@/components/settings/SettingsUi";
import { PERMISSIONS } from "@/lib/permissions";
import { lockSession, setUserPin } from "@/lib/actions/pin";
import { logout } from "@/lib/actions/auth";
import { createEmployee, setEmployeePhoto, type EmployeeListItem } from "@/lib/actions/employees";
import { resizeImageToDataUrl } from "@/lib/image-utils";
import type { RoleRow } from "@/lib/actions/roles";

type BranchOption = { id: string; name: string; isActive: boolean; hasKey: boolean };

// Ajustes → Equipo y Seguridad como en la preview: tarjeta «Equipo», tarjeta «Seguridad y
// autorizaciones» y «Fotos de acceso». Solo un gerente crea y cambia los PIN.
export function TeamPinPanel({
  people,
  currentUserId,
  roles,
  branches,
  maxUsers,
}: {
  people: EmployeeListItem[];
  currentUserId: string;
  roles: RoleRow[];
  branches: BranchOption[];
  maxUsers: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [managing, setManaging] = useState<string | null>(null);
  const [roleSheet, setRoleSheet] = useState(false);
  const [myPinOpen, setMyPinOpen] = useState(false);
  const [myPin, setMyPin] = useState("");

  // Formulario «Registrar nuevo integrante».
  const defaultRoleId = roles.find((r) => r.name === "Vendedor")?.id ?? roles[0]?.id ?? "";
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [pin, setPin] = useState("");
  const [branchId, setBranchId] = useState("");
  const newRole = roles.find((r) => r.id === roleId);
  const activeBranches = branches.filter((b) => b.isActive);

  const managersWithPin = people.filter((p) => p.role === "GERENTE" && p.status === "ACTIVE" && p.hasPin).length;
  const roleOf = (p: EmployeeListItem) => roles.find((r) => r.id === p.roleId) ?? roles.find((r) => r.isSystem && r.baseRole === p.role && (r.name === "Gerente" || r.name === "Vendedor"));
  const keysActive = branches.some((b) => b.hasKey);

  function createUser() {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      toast.error("Escribe nombre y apellido");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      toast.error("Escribe un PIN de 4 dígitos");
      return;
    }
    if (!newRole) return;
    const fd = new FormData();
    fd.set("firstName", parts[0]);
    fd.set("lastName", parts.slice(1).join(" "));
    fd.set("pin", pin);
    fd.set("role", newRole.baseRole);
    fd.set("roleId", newRole.id);
    fd.set("branchId", newRole.baseRole === "VENDEDOR" ? branchId || activeBranches[0]?.id || "" : "");
    start(async () => {
      const r = await createEmployee(fd);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(`Usuario creado: ${name.trim()} · ${newRole.permissions.length} permisos`);
      setName("");
      setPin("");
      router.refresh();
    });
  }

  function saveMyPin() {
    start(async () => {
      const r = await setUserPin(currentUserId, myPin);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Tu PIN quedó guardado.");
      setMyPin("");
      setMyPinOpen(false);
      router.refresh();
    });
  }

  const managed = people.find((p) => p.id === managing);

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className={TWO_COLS}>
        <SCard title={`Equipo (${people.length} de ${maxUsers})`} description="Usuarios y lo que cada uno puede hacer">
          {people.map((p) => {
            const r = roleOf(p);
            return (
              <ListRow
                key={p.id}
                title={displayName(p) + (p.id === currentUserId ? " (tú)" : "")}
                sub={`${r?.name ?? (p.role === "GERENTE" ? "Gerente" : "Vendedor")} · ${r?.permissions.length ?? 0} de ${PERMISSIONS.length} permisos${p.status !== "ACTIVE" ? " · Inactivo" : ""}`}
              >
                <Button type="button" variant="outline" onClick={() => setManaging(p.id)}>
                  Gestionar
                </Button>
              </ListRow>
            );
          })}
          <SubTitle className="mt-3.5">Registrar nuevo integrante</SubTitle>
          <Field label="Nombre" htmlFor="u-n">
            <FieldInput id="u-n" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Rol" htmlFor="u-r">
            <FieldSelect id="u-r" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </FieldSelect>
          </Field>
          {newRole?.baseRole === "VENDEDOR" && activeBranches.length > 1 && (
            <Field label="Sucursal" htmlFor="u-b">
              <FieldSelect id="u-b" value={branchId || activeBranches[0]?.id} onChange={(e) => setBranchId(e.target.value)}>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </FieldSelect>
            </Field>
          )}
          <Field label="PIN de acceso (4 dígitos)" htmlFor="u-pin">
            <FieldInput id="u-pin" type="password" inputMode="numeric" maxLength={4} placeholder="••••" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Qué puede hacer" />
          <PermGrid items={PERMISSIONS} selected={newRole?.permissions ?? []} disabled />
          <p className="mt-2 text-[13px] text-muted-foreground">Los permisos son del rol. Cámbialos desde «Gestionar» o crea un rol nuevo.</p>
          {managersWithPin === 0 && (
            <p role="status" className="mt-2 rounded-[14px] bg-warning/18 px-3.5 py-3 text-[13px] font-semibold text-warning">
              Ningún gerente tiene PIN todavía. Crea primero el tuyo con «Cambiar mi PIN».
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" disabled={pending} onClick={createUser}>
              <PlusIcon /> Crear usuario
            </Button>
            <Button type="button" variant="outline" onClick={() => setRoleSheet(true)}>
              <ShieldCheckIcon /> Crear un rol nuevo
            </Button>
          </div>
        </SCard>

        <SCard title="Seguridad y autorizaciones" description="Protege anular ventas, notas de crédito y el acceso al panel">
          <ListRow title="Clave de pantalla" sub="El sistema se bloquea por inactividad y pide el PIN">
            <Switch on readOnly label="Clave de pantalla" />
          </ListRow>
          <RoleLockRows roles={roles} />
          <ListRow title="Claves de administrador por sede" sub="Cada sede se abre solo con su clave">
            <Switch on={keysActive} readOnly label="Claves de administrador por sede" />
          </ListRow>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setMyPinOpen(true)}>
              Cambiar mi PIN
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await lockSession();
                  if (r.success) router.replace("/lock");
                  else toast.error(r.error);
                })
              }
            >
              Probar bloqueo
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => start(() => logout())}>
              Cerrar sesión
            </Button>
          </div>
        </SCard>
      </div>

      <PhotosCard people={people} roles={roles} />

      {managed && <ManageUserSheet key={managed.id} person={managed} roles={roles} open onOpenChange={(v) => !v && setManaging(null)} pinLocked={managed.role !== "GERENTE" && managersWithPin === 0} />}
      <NewRoleSheet open={roleSheet} onOpenChange={setRoleSheet} />

      <Dialog open={myPinOpen} onOpenChange={setMyPinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar mi PIN</DialogTitle>
            <DialogDescription>Es el código de 4 dígitos con el que desbloqueas tu perfil</DialogDescription>
          </DialogHeader>
          <Field label="Nuevo PIN (4 dígitos)" htmlFor="my-pin">
            <FieldInput id="my-pin" type="password" inputMode="numeric" maxLength={4} placeholder="••••" autoComplete="off" value={myPin} onChange={(e) => setMyPin(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button type="button" disabled={pending || myPin.length !== 4} onClick={saveMyPin}>
              Guardar
            </Button>
            <Button type="button" variant="outline" onClick={() => setMyPinOpen(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// «Fotos de acceso»: la foto de cada persona aparece en su avatar al entrar al sistema.
function PhotosCard({ people, roles }: { people: EmployeeListItem[]; roles: RoleRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    const id = target;
    if (!file || !id) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, { maxDimension: 256, format: "image/jpeg", quality: 0.85 });
      start(async () => {
        const r = await setEmployeePhoto(id, dataUrl);
        if (!r.success) toast.error(r.error);
        else {
          toast.success("Foto actualizada");
          router.refresh();
        }
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo procesar la imagen");
    }
  }

  return (
    <SCard title="Fotos de acceso" description="La foto aparece en tu avatar al entrar al sistema">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Elegir foto"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {people.map((p) => {
        const n = displayName(p);
        const roleName = roles.find((r) => r.id === p.roleId)?.name ?? (p.role === "GERENTE" ? "Gerente" : "Vendedor");
        return (
          <div key={p.id} className="flex items-center justify-between gap-2.5 border-b border-border py-2.5 last:border-0">
            <div className="flex min-w-0 items-center gap-3">
              {p.photoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photoDataUrl} alt="" className="size-11 shrink-0 rounded-full object-cover shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_12%,transparent)]" />
              ) : (
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/12 font-bold text-primary shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_12%,transparent)]">
                  {initialsOf(n)}
                </span>
              )}
              <div className="min-w-0">
                <b className="font-bold">{n}</b>
                <small className="block text-xs text-muted-foreground">{roleName}</small>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setTarget(p.id);
                fileRef.current?.click();
              }}
            >
              <UploadIcon /> Cambiar foto
            </Button>
          </div>
        );
      })}
    </SCard>
  );
}
