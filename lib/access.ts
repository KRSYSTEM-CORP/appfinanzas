// Reglas de acceso por rol, en funciones puras (sin base de datos ni cookies) para poder
// probarlas y usarlas también en el menú. Las guardas de servidor (lib/session.ts) las aplican.
//
// Roles: Dueño/Administrador/Gerente (base GERENTE), Vendedor y Cajero (base VENDEDOR),
// Contador (base VENDEDOR con permisos de Administración) y cualquier rol personalizado.

import { SECTION_PERMISSION, type PermissionId } from "@/lib/permissions";

export type AccessSubject = {
  isSuperAdmin: boolean;
  role: "GERENTE" | "VENDEDOR";
  // Permisos del rol asignado; null = sin rol (comportamiento anterior).
  permissions: string[] | null;
  // Secciones habilitadas a un vendedor sin rol; vacío = sin restricción.
  allowedSections: string[];
};

// Gerente de base (o superadmin de la plataforma): conserva el acceso que ya tenía a los datos.
export function isManagerSession(session: Pick<AccessSubject, "isSuperAdmin" | "role">): boolean {
  return session.role === "GERENTE" || session.isSuperAdmin;
}

// ¿Tiene esta persona el permiso? Un super admin y un gerente sin rol asignado lo tienen todo
// (comportamiento anterior); un vendedor sin rol solo lo que sus secciones habilitan.
export function hasPermission(session: AccessSubject, permission: PermissionId): boolean {
  if (session.isSuperAdmin) return true;
  if (session.permissions) return session.permissions.includes(permission);
  if (session.role === "GERENTE") return true;
  const enabled = session.allowedSections.length === 0 ? Object.keys(SECTION_PERMISSION) : session.allowedSections;
  // «Administración» (contabilidad, nómina, libro IVA, cuentas por cobrar) nunca se hereda de la
  // sección «Documentos» de un vendedor sin rol: solo la dan un rol con ese permiso o ser gerente.
  return enabled.some((sec) => SECTION_PERMISSION[sec] === permission && permission !== "admin");
}

// Caja Chica (apertura, salidas y cierre): gerente, o un rol con el permiso «Caja Chica» (Cajero).
// Un vendedor sin rol o con el rol Vendedor no opera la caja aunque vea la pantalla.
export function canOperateCash(session: Pick<AccessSubject, "isSuperAdmin" | "role" | "permissions">): boolean {
  return isManagerSession(session) || (session.permissions?.includes("cash") ?? false);
}

// ¿Puede entrar a alguna de estas secciones (lib/sections.ts)? Gerente y superadmin siempre.
export function hasSectionAccess(session: AccessSubject, sections: string[]): boolean {
  if (isManagerSession(session)) return true;
  if (session.permissions) return sections.some((s) => session.permissions!.includes(SECTION_PERMISSION[s]));
  return session.allowedSections.length === 0 || sections.some((s) => session.allowedSections.includes(s));
}

export type AccessRule =
  | { kind: "any" }
  | { kind: "manager" }
  | { kind: "superAdmin" }
  | { kind: "permission"; permission: PermissionId }
  | { kind: "managerPermission"; permission: PermissionId }
  | { kind: "section"; sections: string[] };

export function canAccess(session: AccessSubject, rule: AccessRule): boolean {
  switch (rule.kind) {
    case "any":
      return true;
    case "superAdmin":
      return session.isSuperAdmin;
    case "manager":
      return isManagerSession(session);
    case "permission":
      return hasPermission(session, rule.permission);
    case "managerPermission":
      return isManagerSession(session) && hasPermission(session, rule.permission);
    case "section":
      return hasSectionAccess(session, rule.sections);
  }
}

// Módulos de la app y la regla que los protege. Es la fuente de verdad de la matriz rol × módulo:
// el menú, la pantalla de aterrizaje y las pruebas de permisos leen esta tabla, y una prueba
// comprueba que cada página tenga de verdad la guarda que aquí se dice.
export type ModuleAccess = { id: string; label: string; href: string; rule: AccessRule };

export const MODULE_ACCESS: ModuleAccess[] = [
  { id: "home", label: "Inicio", href: "/home", rule: { kind: "manager" } },
  { id: "pos", label: "POS", href: "/pos", rule: { kind: "section", sections: ["pos"] } },
  { id: "inventory", label: "Inventario", href: "/inventory", rule: { kind: "section", sections: ["inventory"] } },
  { id: "quotes", label: "Presupuestos", href: "/quotes/history", rule: { kind: "section", sections: ["quotes"] } },
  { id: "cash", label: "Caja Chica", href: "/reports", rule: { kind: "section", sections: ["reports"] } },
  { id: "stats", label: "Estadísticas", href: "/finance", rule: { kind: "permission", permission: "stats" } },
  { id: "crm", label: "Marketing", href: "/customers", rule: { kind: "section", sections: ["customers"] } },
  { id: "admin", label: "Administración", href: "/accounting", rule: { kind: "permission", permission: "admin" } },
  { id: "purchases", label: "Compras y proveedores", href: "/purchases", rule: { kind: "permission", permission: "purchases" } },
  { id: "documents", label: "Documentos", href: "/documents", rule: { kind: "section", sections: ["documents"] } },
  { id: "taxbook", label: "Libro IVA", href: "/tax-book", rule: { kind: "permission", permission: "admin" } },
  { id: "payroll", label: "Nómina", href: "/payroll", rule: { kind: "permission", permission: "admin" } },
  { id: "employees", label: "Perfiles y PIN", href: "/employees", rule: { kind: "manager" } },
  { id: "branches", label: "Sucursales", href: "/branches", rule: { kind: "managerPermission", permission: "branches" } },
  { id: "assistant", label: "Asistente IA", href: "/assistant", rule: { kind: "managerPermission", permission: "assistant" } },
  { id: "settings", label: "Ajustes", href: "/settings", rule: { kind: "managerPermission", permission: "settings" } },
  { id: "billing", label: "Suscripción mensual", href: "/billing", rule: { kind: "manager" } },
  { id: "learning", label: "Learning", href: "/learning", rule: { kind: "any" } },
  { id: "platform", label: "Plataforma", href: "/admin", rule: { kind: "superAdmin" } },
];

// A dónde llevar a quien no puede abrir una pantalla (o al iniciar sesión): el POS si lo tiene; si no,
// el primer módulo de operación que sí puede usar; Learning es para todo el equipo y nunca rebota.
const LANDING_ORDER = ["pos", "cash", "inventory", "crm", "stats", "admin", "purchases", "documents", "learning"];

export function landingPath(session: AccessSubject): string {
  for (const id of LANDING_ORDER) {
    const mod = MODULE_ACCESS.find((m) => m.id === id);
    if (mod && canAccess(session, mod.rule)) return mod.href;
  }
  return "/learning";
}
