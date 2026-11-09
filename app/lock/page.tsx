import { redirect } from "next/navigation";
import { LockScreen } from "@/components/lock/LockScreen";
import { listLockProfiles } from "@/lib/actions/pin";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LockPage() {
  const session = await getSession();
  // Cookie firmada pero inválida (usuario borrado o suspendido): se limpia por el
  // Route Handler para no entrar en un ciclo con proxy.ts.
  if (!session) redirect("/api/auth/clear-session");
  if (!session.locked) redirect("/pos");

  const profiles = await listLockProfiles();
  return <LockScreen companyName={session.companyName} profiles={profiles} />;
}
