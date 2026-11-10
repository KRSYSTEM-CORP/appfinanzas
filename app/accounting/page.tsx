import { requireAccountingPlan } from "@/lib/session";
import { AccountingHub } from "@/components/accounting/AccountingHub";

const sections = [
  {
    href: "/finance",
    title: "Finanzas",
    description: "Ingresos, gastos, ganancia neta y desglose por moneda.",
  },
  {
    href: "/accounting/sellers",
    title: "Ventas por vendedor",
    description: "Cuánto vendió cada vendedor, sus documentos y su comisión.",
  },
  {
    href: "/accounting/receivables",
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
    href: "/tax-book",
    title: "Libro de Contabilidad",
    description: "Libro de compras y ventas para la declaración de IVA.",
  },
];

export default async function AccountingPage() {
  await requireAccountingPlan();
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <p className="kr-eyebrow">Finanzas y obligaciones</p>
        <h1 className="kr-h1">Administración</h1>
      </div>
      <AccountingHub sections={sections} />
    </div>
  );
}
