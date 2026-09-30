"use client";

import { useEffect, useState } from "react";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";

// Bump the suffix (v1 -> v2) if the content changes enough that returning
// users should see it again — otherwise this only ever shows once per
// browser, the first time someone lands on the login screen.
const DISMISS_KEY = "kr-pos-welcome-dismissed-v1";

const STEPS = [
  "Crea tu cuenta o inicia sesión con el correo de tu empresa.",
  "Configura tu inventario: agrega tus productos, precios y existencias.",
  "Empieza a vender desde el Punto de Venta — acepta efectivo, tarjeta, transferencia o pago móvil.",
  "Revisa tus Reportes y Finanzas para ver cómo va tu negocio en tiempo real.",
];

// A first-visit explainer — deliberately an inline, collapsed-by-default
// disclosure rather than a blocking full-screen modal, so it never delays
// the one thing a returning user actually came here to do: sign in. It
// still teaches a brand-new visitor what the product is, one tap away.
export function WelcomeModal() {
  const [dismissed, setDismissed] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDismissed(Boolean(localStorage.getItem(DISMISS_KEY)));
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div className="w-full max-w-sm mx-auto rounded-xl border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
      >
        <SparklesIcon className="size-4 text-primary shrink-0" />
        <span className="text-sm font-medium flex-1">¿Qué es KR POS?</span>
        <ChevronDownIcon
          className={`size-4 text-muted-foreground shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          <p className="text-sm text-muted-foreground mt-3">
            Punto de venta, inventario, finanzas y facturación en un solo sistema — pensado para
            pymes que venden en múltiples monedas y necesitan control real de su negocio.
          </p>

          <p className="text-sm font-medium mt-4 mb-2">Para empezar:</p>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1.5">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <button
            type="button"
            onClick={dismiss}
            className="mt-4 text-sm font-medium text-primary hover:underline"
          >
            Entendido, no mostrar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
