import Link from "next/link";
import { COPYRIGHT_LINE } from "@/lib/legal";

// Public pages only (login/signup) — the authenticated app doesn't carry
// this, to keep working screens like the POS or Inventario uncluttered.
export function SiteFooter() {
  return (
    <footer className="mt-auto flex flex-col items-center gap-2 px-6 pt-10 pb-6 text-center text-xs text-muted-foreground">
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        <Link href="/privacidad" className="hover:underline">
          Política de Privacidad
        </Link>
        <span>·</span>
        <Link href="/terminos" className="hover:underline">
          Términos y Condiciones
        </Link>
        <span>·</span>
        <Link href="/cookies" className="hover:underline">
          Aviso de Cookies
        </Link>
      </div>
      <p>{COPYRIGHT_LINE}</p>
    </footer>
  );
}
