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
    href: "/tax-book",
    title: "Libro de Contabilidad",
    description: "Libro de compras y ventas para la declaración de IVA.",
  },
];

export default function AccountingPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Contabilidad</h1>
      <AccountingHub sections={sections} />
    </div>
  );
}
