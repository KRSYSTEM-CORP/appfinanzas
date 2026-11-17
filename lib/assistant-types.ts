// Tipos compartidos entre el servidor y el chat del Asistente. Sin dependencias de servidor.

// Lo que el modelo PIDE mostrar. Nunca trae cifras: el servidor consulta los datos reales.
export const DATASETS = [
  "ventas_por_dia",
  "ventas_recientes",
  "top_productos",
  "stock_bajo",
  "inventario",
  "cuentas_por_cobrar",
  "gastos_por_categoria",
  "clientes_top",
  "reporte_completo",
] as const;
export type DatasetId = (typeof DATASETS)[number];

export const DATASET_LABELS: Record<DatasetId, string> = {
  ventas_por_dia: "Ventas por día",
  ventas_recientes: "Últimas ventas",
  top_productos: "Productos más vendidos",
  stock_bajo: "Productos con stock bajo",
  inventario: "Inventario",
  cuentas_por_cobrar: "Cuentas por cobrar",
  gastos_por_categoria: "Gastos por categoría",
  clientes_top: "Mejores clientes",
  reporte_completo: "Reporte completo de ventas",
};

// Rutas a las que el asistente puede llevar al usuario (lista cerrada).
export const ASSISTANT_LINKS: Record<string, string> = {
  pos: "/pos",
  inventario: "/inventory",
  caja: "/reports",
  estadisticas: "/finance",
  marketing: "/customers",
  administracion: "/accounting",
  compras: "/purchases",
  cuentas_por_cobrar: "/accounting/receivables",
  nomina: "/payroll",
  sucursales: "/branches",
  ajustes: "/settings",
};

// Reporte completo (PDF): indicadores y secciones ya formateadas por el servidor.
export type ReportKpi = { label: string; value: string; hint?: string };
export type ReportSection = {
  title: string;
  note?: string;
  columns: string[];
  rows: string[][];
  totals?: string[];
};
export type FullReport = {
  kpis: ReportKpi[];
  sections: ReportSection[];
  notes: string[];
};

export type ResolvedTable = {
  // Presente solo en el reporte completo.
  report?: FullReport;
  type: "table";
  dataset: DatasetId;
  title: string;
  subtitle: string;
  columns: string[];
  rows: string[][];
  // Última fila de totales (opcional), para el PDF y la tabla.
  totals?: string[];
  from: string;
  to: string;
};
export type ResolvedChart = {
  type: "chart";
  dataset: DatasetId;
  title: string;
  kind: "bar" | "line";
  points: { label: string; value: number; display: string }[];
};
export type ResolvedProducts = {
  type: "products";
  title: string;
  items: { id: string; name: string; category: string | null; price: string; stock: string; imageUrl: string | null }[];
};
export type ResolvedLink = { type: "link"; label: string; href: string };
export type ResolvedBlock = ResolvedTable | ResolvedChart | ResolvedProducts | ResolvedLink;

// Vista previa EXACTA de una venta propuesta (calculada por el servidor con los precios reales).
export type SalePreview = {
  lines: { name: string; quantity: number; unit: string; subtotal: string }[];
  total: string;
  discountPercent: number;
  customer: string;
  paymentLabel: string;
  issues: string[];
};
