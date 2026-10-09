import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";

export default async function Home() {
  const session = await requireSession();
  redirect(session.role === "GERENTE" || session.isSuperAdmin ? "/home" : "/pos");
}
