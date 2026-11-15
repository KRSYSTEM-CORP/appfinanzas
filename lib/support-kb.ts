import { AI_APPLY_COST, AI_PACKS } from "@/lib/assistant";
import { TRIAL_DAYS } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

// Manual de uso que se le da al Asistente IA para contestar "¿cómo se hace…?".
// Lo de los planes sale de lib/plans.ts, así nunca queda desactualizado; el resto
// describe dónde está cada cosa en el menú. Si algo no está aquí, el asistente
// debe decirlo y mandar al usuario a soporte de KR System (no inventar pasos).

const usd = (cents: number) => `$${(cents / 100).toFixed(2).replace(".", ",")}`;

function plansSection(): string {
  const lines = Object.values(PLANS).map((p) => {
    const first = p.firstMonthUsdCents ? ` (primer mes ${usd(p.firstMonthUsdCents)} para empresas nuevas)` : "";
    return `- ${p.label}: ${usd(p.priceUsdCents)} al mes${first}. Hasta ${p.maxUsers} ${p.maxUsers === 1 ? "usuario" : "usuarios"}, ${
      p.maxProducts == null ? "productos ilimitados" : `${p.maxProducts} productos`
    }, ${p.aiCredits} créditos de IA al mes, ${p.accounting ? "incluye Contabilidad" : "sin Contabilidad"}.`;
  });
  const packs = AI_PACKS.map((p) => `${p.credits} créditos por ${usd(p.priceCents)}`).join("; ");
  return [
    "PLANES Y SUSCRIPCIÓN",
    ...lines,
    `- Toda empresa nueva tiene ${TRIAL_DAYS} días gratis. La suscripción se paga en bolívares a la tasa dólar BCV del día, en el menú «Suscripción mensual».`,
    "- Para cambiar de plan o pagar, la persona dueña usa «Suscripción mensual»; los pagos los confirma el equipo de KR System.",
    `- Créditos de IA: preguntar es gratis (con un tope de 20 consultas al día, igual para todos los planes). Aplicar un cambio que proponga el asistente cuesta ${AI_APPLY_COST} créditos y solo si confirmas. Se pueden comprar créditos extra, que no vencen: ${packs}. Se piden desde la pantalla del Asistente y se suman cuando KR System confirma el pago.`,
  ].join("\n");
}

const MODULES = `MÓDULOS (el menú tiene tres grupos)
OPERACIÓN
- Inicio: ganancia neta estimada del periodo, accesos rápidos, avisos que no pueden esperar, ventas por hora, meta de ganancia, lo más vendido y últimas ventas.
- POS: para vender. Se cobra en la divisa de referencia o en bolívares según la tasa; ventas a crédito y pagos mixtos.
- Inventario: productos, existencias, categorías, movimientos de cada producto, importar desde archivo y traspasos entre sucursales. Para subir existencias: Editar producto → «Sumar existencias».
- Presupuestos: cotizaciones para clientes; se pueden convertir en venta y compartir.
CONTROL
- Caja Chica: abrir y cerrar la caja del turno (el cierre incluye contar el efectivo), días pendientes por cerrar, ventas del día y su estado. Las Estadísticas solo cuentan los días con caja cerrada.
- Estadísticas: ventas, costos, gastos y ganancia, distribución de ventas por método de pago, productos más comprados, rotación y punto de equilibrio. Solo en los planes Pyme y Corporativo.
- Marketing: clientes, su historial, notas, próximo contacto y cumpleaños.
- Administración: Balance, cuentas bancarias, compras y proveedores, cuentas por cobrar (ventas a crédito y abonos), libro de impuestos y nómina. Al registrar una compra o pagar la nómina se elige de qué cuenta sale el dinero y se descuenta de su saldo. En nómina el gerente decide el monto, la fecha y la cuenta de cada pago; puede pagar por partes o adelantar, y el sistema muestra cuánto queda debiendo. Contabilidad: solo en los planes Pyme y Corporativo.
- Documentos: facturas, notas de entrega y comprobantes generados.
RED Y PLATAFORMA
- Sucursales: resumen de cada sede; para entrar a una se pide la clave de administrador. El plan Emprende incluye una sola sucursal; Pyme y Corporativo permiten varias.
- Asistente IA: responde con los datos reales del negocio (tablas, gráficos, fotos de productos), genera PDF de reportes con vista previa y puede proponer registrar un gasto, ajustar precios de una categoría o registrar una venta; cada cambio se confirma antes de aplicarse y se puede deshacer 24 horas.
- Learning: videos cortos de cómo usar el sistema (solo los sube el equipo de KR System).
- Ajustes: Mi plan, moneda y tasa, apariencia, impresión, datos fiscales, IVA, datos para cobrar, sucursales y cambio de clave. Los perfiles y su PIN se administran desde la búsqueda («Perfiles y PIN»).`;

const ACCESS = `ACCESO
- Se entra con el correo y la clave de la empresa; después cada persona elige su perfil (foto) y escribe su PIN.
- Si alguien olvidó su clave: en la pantalla de entrada, «¿Olvidaste tu contraseña?».
- Cuando se llega al tope de usuarios o de productos del plan, el sistema lo avisa y hay que subir de plan o desactivar a alguien.`;

const PROBLEMS = `PROBLEMAS FRECUENTES
- «No puedo agregar más productos / usuarios / sucursales»: se llegó al tope del plan (Emprende: 1 sucursal). Solución: subir de plan, o desactivar usuarios que ya no trabajan (eso libera cupo).
- «No veo Contabilidad»: está solo en Pyme y Corporativo.
- «Los precios en bolívares no cuadran»: revisar en Ajustes que la tasa esté al día.
- «El asistente dice que llegué al límite de consultas»: el tope es de 20 consultas al día; se reinicia al día siguiente.
- «No tengo créditos para aplicar un cambio»: comprar un paquete desde el Asistente, o esperar al mes siguiente (los del plan se reinician cada mes).
- «No puedo cambiar precios con “Todas las sucursales”»: elegir primero una sucursal.`;

export function supportKnowledge(): string {
  return [ACCESS, MODULES, plansSection(), PROBLEMS].join("\n\n");
}
