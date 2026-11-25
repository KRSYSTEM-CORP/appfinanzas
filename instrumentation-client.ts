import * as Sentry from "@sentry/nextjs";

// Sin internet no se inicia Sentry (cada envío fallido era una petición más
// y se reintentaba en bucle). Las sesiones de navegador tampoco se envían:
// solo interesan los errores, no un ping por cada carga de página.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: typeof navigator === "undefined" || navigator.onLine,
  integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
