// Navegación interna de Administración (preview 05 · #adm): tarjetas de grupo y sub-pestañas.
// Cada sub-pestaña tiene su ruta; todas comparten la misma cabecera (AdminShell).

export type AdminGroupId = "balance" | "bancos" | "compras" | "consumo" | "conta";

export type AdminSub = { id: string; label: string; href: string };
export type AdminGroup = { id: AdminGroupId; label: string; hint: string; icon: "money" | "bank" | "cart" | "box" | "doc"; subs: AdminSub[] };

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    id: "balance",
    label: "Balance",
    hint: "Resumen, cobros y gastos",
    icon: "money",
    subs: [
      { id: "resumen", label: "Resumen", href: "/accounting" },
      { id: "cobros", label: "Cobros", href: "/accounting/cobros" },
      { id: "gastos", label: "Gastos", href: "/accounting/gastos" },
    ],
  },
  {
    id: "bancos",
    label: "Cuentas Bancarias",
    hint: "Saldos y vínculo con cada método de pago",
    icon: "bank",
    subs: [{ id: "cuentas", label: "Cuentas", href: "/accounting/accounts" }],
  },
  {
    id: "compras",
    label: "Compras",
    hint: "Compras, órdenes de pago y proveedores",
    icon: "cart",
    subs: [
      { id: "registro", label: "Registro de compras", href: "/purchases" },
      { id: "prov", label: "Proveedores", href: "/suppliers" },
      { id: "ordenes", label: "Órdenes de pago", href: "/purchases/orders" },
      { id: "calif", label: "Calificación", href: "/suppliers/rating" },
    ],
  },
  {
    id: "consumo",
    label: "Consumo Interno",
    hint: "Retiros de socios y personal",
    icon: "box",
    subs: [{ id: "retiros", label: "Retiros", href: "/accounting/consumption" }],
  },
  {
    id: "conta",
    label: "Contabilidad",
    hint: "Estados, costos, nómina y fiscal",
    icon: "doc",
    subs: [
      { id: "mov", label: "Movimientos", href: "/accounting/statements?tab=mov" },
      { id: "estado", label: "Estado de resultados", href: "/accounting/statements?tab=estado" },
      { id: "sit", label: "Situación financiera", href: "/accounting/statements?tab=sit" },
      { id: "costo", label: "Análisis de costo", href: "/accounting/statements?tab=costo" },
      { id: "nomina", label: "Nómina", href: "/payroll" },
      { id: "lventas", label: "Libro de ventas", href: "/tax-book?libro=ventas" },
      { id: "lcompras", label: "Libro de compras", href: "/tax-book?libro=compras" },
      { id: "iva", label: "Resumen de IVA", href: "/accounting/statements?tab=iva" },
    ],
  },
];

export function adminGroup(id: AdminGroupId): AdminGroup {
  return ADMIN_GROUPS.find((g) => g.id === id) ?? ADMIN_GROUPS[0];
}

// Pestaña de Contabilidad válida a partir de ?tab= (por defecto Movimientos).
export const STATEMENT_TABS = ["mov", "estado", "sit", "costo", "iva"] as const;
export type StatementTab = (typeof STATEMENT_TABS)[number];
export function statementTab(raw: string | undefined): StatementTab {
  return (STATEMENT_TABS as readonly string[]).includes(raw ?? "") ? (raw as StatementTab) : "mov";
}
