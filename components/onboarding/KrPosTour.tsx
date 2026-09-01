"use client";

import { Rocket, ShoppingCart, Package, ClipboardList, Landmark, Settings2 } from "lucide-react";
import { ProductTour, type TourStep } from "@/components/onboarding/ProductTour";

const STEPS: TourStep[] = [
  {
    icon: <Rocket className="size-6" />,
    title: "¡Bienvenido a KR POS!",
    description:
      "Te damos un recorrido rápido por las secciones principales, para que le saques provecho al sistema desde el primer día.",
  },
  {
    icon: <ShoppingCart className="size-6" />,
    title: "Punto de venta",
    description:
      "Registra ventas en segundos: efectivo, tarjeta, Pago Móvil o divisas, todo en la misma venta, con la tasa del día siempre a la mano.",
  },
  {
    icon: <Package className="size-6" />,
    title: "Inventario",
    description:
      "Agrega tus productos, precios y existencias. El stock se descuenta solo con cada venta y se repone con cada compra.",
  },
  {
    icon: <ClipboardList className="size-6" />,
    title: "Reportes",
    description:
      "Revisa el historial de ventas, filtra por pagadas o a crédito, y cierra la caja del día — incluyendo cualquier día pendiente que se te haya quedado sin cerrar.",
  },
  {
    icon: <Landmark className="size-6" />,
    title: "Contabilidad y Finanzas",
    description:
      "Ingresos, gastos, compras y ganancia neta estimada, siempre al día — y tu libro fiscal listo para exportar.",
  },
  {
    icon: <Settings2 className="size-6" />,
    title: "Configuración",
    description:
      "Personaliza tu marca, moneda de referencia, sucursales y empleados desde Administración. Ya puedes empezar a vender.",
  },
];

export function KrPosTour({ hasSeenTour }: { hasSeenTour: boolean }) {
  if (hasSeenTour) return null;
  return <ProductTour steps={STEPS} />;
}
