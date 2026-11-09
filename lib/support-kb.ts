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
    return `- ${p.label}: ${usd(p.priceUsdCents)} al mes${first}. Hasta ${p.maxUsers} usuarios, ${
      p.maxProducts == null ? "productos ilimitados" : `${p.maxProducts} productos`
    }, ${p.aiCredits} créditos de IA al mes, ${p.accounting ? "incluye Contabilidad" : "sin Contabilidad"}.`;
  });
  const packs = AI_PACKS.map((p) => `${p.credits} créditos por ${usd(p.priceCents)}`).join("; ");
  return [
    "PLANES Y SUSCRIPCIÓN",
    ...lines,
    `- Toda empresa nueva tiene ${TRIAL_DAYS} días gratis. La suscripción se paga en bolívares a la tasa dólar BCV del día, en el menú «Suscripción mensual».`,
    "- Para cambiar de plan o pagar, la persona dueña usa «Suscripción mensual»; los pagos los confirma el equipo de KR System.",
    `- Créditos de IA: preguntar es gratis (con un tope diario según el plan). Aplicar un cambio que proponga el asistente cuesta ${AI_APPLY_COST} créditos y solo si confirmas. Se pueden comprar créditos extra, que no vencen: ${packs}. Se piden desde la pantalla del Asistente y se suman cuando KR System confirma el pago.`,
  ].join("\n");
}

const MODULES = `MÓDULOS (dónde está cada cosa en el menú)
- Punto de venta: para vender. Se cobra en la divisa de referencia o en bolívares según la tasa configurada; puede haber ventas a crédito y pagos mixtos.
- Presupuestos: cotizaciones para clientes; se pueden convertir en venta y compartir.
- Inventario: productos, existencias, categorías, movimientos de cada producto, importar desde archivo, actualización masiva y traspasos entre sucursales.
- Clientes: ficha de cada cliente, sus compras y lo que debe. La sección de seguimiento a clientes se llama Marketing.
- Reportes: ventas por período, cierre de caja y caja chica.
- Documentos: facturas, notas y comprobantes generados.
- Resumen del negocio: panel con lo más importante del día.
- Contabilidad: solo en los planes Pyme y Corporativo. Incluye libro de impuestos y finanzas (gastos, ganancia, punto de equilibrio y meta de ganancia).
- Nómina: pago por quincena de los empleados, con recibo en PDF.
- Administración de perfiles: aquí la persona dueña crea y desactiva usuarios del negocio.
- Ajustes: datos de la empresa, divisas y tasa, sucursales y medios de pago.
- Suscripción mensual: plan, pagos y reportar un pago.
- Aprendizaje: videos cortos de cómo usar el sistema (solo los sube el equipo de KR System).
- Asistente IA: responde preguntas sobre los datos del negocio y puede proponer registrar un gasto o ajustar precios de una categoría.`;

const ACCESS = `ACCESO
- Se entra con el correo y la clave de la empresa; después cada persona elige su perfil (foto) y escribe su PIN.
- Si alguien olvidó su clave: en la pantalla de entrada, «¿Olvidaste tu contraseña?».
- Cuando se llega al tope de usuarios o de productos del plan, el sistema lo avisa y hay que subir de plan o desactivar a alguien.`;

const PROBLEMS = `PROBLEMAS FRECUENTES
- «No puedo agregar más productos / usuarios»: se llegó al tope del plan. Solución: subir de plan, o desactivar usuarios que ya no trabajan (eso libera cupo).
- «No veo Contabilidad»: está solo en Pyme y Corporativo.
- «Los precios en bolívares no cuadran»: revisar en Ajustes que la tasa esté al día.
- «El asistente dice que llegué al límite de consultas»: es un tope diario según el plan; se reinicia al día siguiente.
- «No tengo créditos para aplicar un cambio»: comprar un paquete desde el Asistente, o esperar al mes siguiente (los del plan se reinician cada mes).
- «No puedo cambiar precios con “Todas las sucursales”»: elegir primero una sucursal.`;

export function supportKnowledge(): string {
  return [ACCESS, MODULES, plansSection(), PROBLEMS].join("\n\n");
}
