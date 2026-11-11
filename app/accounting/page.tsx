import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { AccountingHub } from "@/components/accounting/AccountingHub";

const sections = [
  {
    href: "/finance",
    title: "Finanzas",
    description: "Ingresos, gastos, ganancia neta y desglose por moneda.",
  },
  {
    href: "/customers/receivables",
    title: "Cuentas por cobrar",
    description: "Ventas a crédito con saldo pendiente y abonos por registrar.",
  },
  {
    href: "/suppliers",
    title: "Proveedores",
    description: "Directorio de proveedores y sus datos de contacto.",
  },
  {
    href: "/purchases",
    title: "Compras",
    description: "Órdenes de compra, cuentas por pagar y estado de cada una.",
  },
  {
    href: "/payroll",
    title: "Nómina",
    description: "Empleados, pago por quincena con comprobante e historial de pagos.",
  },
  {
    href: "/inventory",
    title: "Consumo interno",
    description: "Retiros de inventario por socios o personal.",
  },
  {
    href: "/settings",
    title: "Cuentas y perfiles",
    description: "Datos para cobrar, perfiles y PIN del equipo.",
  },
  {
    href: "/documents",
    title: "Documentos",
    description: "Notas de entrega, tickets y comprobantes emitidos.",
  },
  {
    href: "/billing",
    title: "Suscripción",
    description: "Plan, vencimiento y pagos de tu suscripción mensual.",
  },
  {
    href: "/tax-book",
    title: "Libro de Contabilidad",
    description: "Libro de compras y ventas para la declaración de IVA.",
  },
];

export default async function AccountingPage() {
  await requirePermission("admin");
  await requireAccountingPlan();
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <p className="kr-eyebrow">Contabilidad renovada</p>
        <h1 className="kr-h1">Administración</h1>
      </div>
      <AccountingHub sections={sections} />
    </div>
  );
}
