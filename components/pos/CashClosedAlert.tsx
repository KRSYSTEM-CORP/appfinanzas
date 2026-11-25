import Link from "@/components/ui/nav-link";
import { CASH_CLOSED_MESSAGE } from "@/lib/cash-gate";

export function CashClosedAlert({ offline = false }: { offline?: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-destructive bg-destructive/10 px-4 py-3 text-destructive">
      <div>
        <b className="block font-extrabold">Caja sin abrir: no se puede vender</b>
        <span className="text-sm font-semibold">
          {offline ? "La última vez que hubo conexión la caja estaba cerrada. Si ya la abriste, ignora este aviso. " : ""}
          {CASH_CLOSED_MESSAGE}
        </span>
      </div>
      {!offline && (
        <Link href="/reports" className="rounded-xl bg-destructive px-4 py-2 text-sm font-extrabold text-white">
          Abrir caja
        </Link>
      )}
    </div>
  );
}
