// Mensaje seguro para mostrar al usuario. Los errores de negocio (lanzados con texto en español)
// se muestran tal cual; los técnicos (Prisma, red, SQL, texto en inglés) se reemplazan por `fallback`.
export function userErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message?.trim();
  if (!msg) return fallback;
  const technical =
    /prisma|invalid `|\bP\d{4}\b|\bECONN|ETIMEDOUT|fetch failed|socket|violates|constraint|syntax error|relation "|column "|transaction|timeout|\bat \S+ \(/i;
  if (err.name.startsWith("Prisma") || technical.test(msg) || msg.length > 240) return fallback;
  // Texto sin ninguna señal de español (sin acentos ni palabras comunes) suele ser un error técnico en inglés.
  const spanish = /[áéíóúñ¿¡]|\b(no|el|la|los|las|de|del|que|se|un|una|en|por|para|con|ya|hay|es|tu|su)\b/i;
  return spanish.test(msg) ? msg : fallback;
}
