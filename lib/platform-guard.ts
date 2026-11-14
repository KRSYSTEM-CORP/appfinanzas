import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Validación de superadmin para páginas, rutas y acciones de servidor de la Plataforma.
// Una cookie firmada pero vieja (usuario borrado o suspendido) se limpia por el Route Handler.
export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) redirect("/api/auth/clear-session");
  if (session.locked) redirect("/lock");
  if (!session.isSuperAdmin) redirect("/pos");
  return session;
}
