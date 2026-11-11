import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PinControl } from "@/components/employees/PinControl";
import { IdleTimeoutSetting } from "@/components/settings/IdleTimeoutSetting";
import { RoleSelect, RolesMatrix } from "@/components/settings/RolesPanel";
import type { EmployeeListItem } from "@/lib/actions/employees";
import type { RoleRow } from "@/lib/actions/roles";

// Ajustes → Equipo y PIN: solo un gerente crea y cambia el código personal (PIN) de cada
// persona. Cada quien lo usa para entrar a su perfil tras iniciar sesión con el correo y la
// clave de la empresa.
export function TeamPinPanel({ people, currentUserId, roles }: { people: EmployeeListItem[]; currentUserId: string; roles: RoleRow[] }) {
  const managersWithPin = people.filter((p) => p.role === "GERENTE" && p.status === "ACTIVE" && p.hasPin).length;
  return (
    <div className="flex flex-col gap-4">
      <IdleTimeoutSetting />
      <p className="text-sm text-muted-foreground">
        Todas las personas entran con el correo y la clave de la empresa y luego eligen su perfil con su código
        personal (PIN). Aquí lo creas o lo cambias; solo un gerente puede hacerlo.
      </p>
      {managersWithPin === 0 && (
        <p role="status" className="rounded-2xl bg-warning/18 p-4 text-sm text-warning">
          Ningún gerente tiene PIN todavía. Crea primero el tuyo: hasta entonces no se puede asignar el de los demás.
        </p>
      )}
      <ul className="flex flex-col divide-y rounded-[19px] bg-card shadow-(--shadow-card)">
        {people.map((p) => {
          const name = p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : p.email.split("@")[0];
          const locked = p.role !== "GERENTE" && managersWithPin === 0;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {name}
                  {p.id === currentUserId && <span className="ml-2 text-xs font-medium text-muted-foreground">(tú)</span>}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {roles.find((r) => r.id === p.roleId)?.name ?? (p.role === "GERENTE" ? "Gerente" : "Vendedor")}
                  {p.status !== "ACTIVE" && <Badge variant="destructive">Inactivo</Badge>}
                </p>
              </div>
              <RoleSelect userId={p.id} roleId={p.roleId} roles={roles} />
              {locked ? (
                <span className="text-xs text-muted-foreground">Disponible cuando un gerente tenga PIN</span>
              ) : (
                <PinControl userId={p.id} name={name} hasPin={p.hasPin} />
              )}
            </li>
          );
        })}
      </ul>
      <RolesMatrix roles={roles} />
      <p className="text-xs text-muted-foreground">
        Para agregar personas o cambiar su rol y sucursal usa{" "}
        <Link href="/employees" className="underline underline-offset-4">
          Administración de perfiles
        </Link>
        .
      </p>
    </div>
  );
}
