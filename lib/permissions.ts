// Permisos de la preview (12) y roles por defecto. Un rol con permisos editables vive en
// CompanyRole; los usuarios sin rol conservan el comportamiento anterior.

export const PERMISSIONS = [
  { id: "pos", label: "Punto de venta" },
  { id: "inventory", label: "Inventario" },
  { id: "purchases", label: "Compras y proveedores" },
  { id: "crm", label: "Clientes (CRM)" },
  { id: "admin", label: "Administración" },
  { id: "stats", label: "Estadísticas" },
  { id: "cash", label: "Caja Chica" },
  { id: "branches", label: "Sucursales" },
  { id: "assistant", label: "Asistente IA" },
  { id: "settings", label: "Ajustes y suscripción" },
  { id: "void", label: "Anular ventas" },
  { id: "costs", label: "Ver costos y ganancias" },
] as const;

export type PermissionId = (typeof PERMISSIONS)[number]["id"];
export const ALL_PERMISSIONS: PermissionId[] = PERMISSIONS.map((p) => p.id);

export type DefaultRole = { name: string; baseRole: "GERENTE" | "VENDEDOR"; permissions: PermissionId[] };

export const DEFAULT_ROLES: DefaultRole[] = [
  { name: "Dueño", baseRole: "GERENTE", permissions: ALL_PERMISSIONS },
  { name: "Administrador", baseRole: "GERENTE", permissions: ALL_PERMISSIONS },
  { name: "Gerente", baseRole: "GERENTE", permissions: ALL_PERMISSIONS.filter((p) => p !== "settings") },
  { name: "Cajero", baseRole: "VENDEDOR", permissions: ["pos", "cash", "crm"] },
  { name: "Vendedor", baseRole: "VENDEDOR", permissions: ["pos", "crm"] },
  { name: "Contador", baseRole: "VENDEDOR", permissions: ["admin", "stats", "purchases", "costs"] },
];

// Sección de la app (lib/sections.ts) -> permiso que la habilita.
export const SECTION_PERMISSION: Record<string, PermissionId> = {
  pos: "pos",
  quotes: "pos",
  inventory: "inventory",
  customers: "crm",
  reports: "cash",
  documents: "admin",
};
