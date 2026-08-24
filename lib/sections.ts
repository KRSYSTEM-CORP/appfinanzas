// The fixed set of top-level sections a VENDEDOR's access can be
// individually toggled for (see requireSectionAccess in lib/session.ts and
// the checklist in components/employees/EmployeeTable.tsx). Contabilidad,
// Administración de perfiles, Configuración and Suscripción mensual are
// deliberately absent — those stay always-manager or always-visible,
// unrelated to this per-seller picker. A GERENTE is never filtered by this
// list at all.
export type AppSection = "pos" | "quotes" | "inventory" | "customers" | "reports" | "documents";

export const APP_SECTIONS: { id: AppSection; label: string }[] = [
  { id: "pos", label: "Punto de venta" },
  { id: "quotes", label: "Presupuestos" },
  { id: "inventory", label: "Inventario" },
  { id: "customers", label: "Clientes" },
  { id: "reports", label: "Reportes" },
  { id: "documents", label: "Documentos" },
];
