"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClockIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/shared/SectionCard";
import { applyBcvNextRate, fetchAndUpdateBcvRate, getBcvOfficialInfo } from "@/lib/actions/settings";
import { formatValueDate, type BcvOfficialInfo } from "@/lib/bcv-next-rate";
import { formatLocalCurrency } from "@/lib/currencies";
import type { ReferenceCurrency } from "@prisma/client";

function fmtRate(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Tasa vigente, «Próxima tasa» del BCV (con su fecha valor) y los botones para actualizarla ya.
// La tasa se renueva sola cada día (cron de las 7:00 p. m. y revisión de medianoche); estos botones
// son para no esperar. La consulta al BCV se hace aquí, en el cliente, para no frenar Ajustes.
export function RatePanel({
  rate,
  updatedAtIso,
  localCurrencyCode,
  referenceCurrency,
  stale,
}: {
  rate: number | null;
  updatedAtIso: string | null;
  localCurrencyCode: string;
  referenceCurrency: ReferenceCurrency;
  stale: boolean;
}) {
  const router = useRouter();
  const isVes = localCurrencyCode === "VES";
  const refSymbol = referenceCurrency === "USD" ? "$1" : "€1";
  const [info, setInfo] = useState<BcvOfficialInfo | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isVes) return;
    let alive = true;
    getBcvOfficialInfo()
      .then((r) => alive && setInfo(r))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [isVes, rate]);

  const updated = updatedAtIso
    ? new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(updatedAtIso))
    : null;
  const bigRate = rate != null ? (isVes ? `Bs ${fmtRate(rate)}` : formatLocalCurrency(rate, localCurrencyCode)) : "No configurada";

  function refresh() {
    startTransition(async () => {
      const result = await fetchAndUpdateBcvRate();
      if (result.success) {
        toast.success("Tasa actualizada con la del BCV.");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function advance() {
    startTransition(async () => {
      const result = await applyBcvNextRate();
      if (result.success) {
        toast.success("Próxima tasa aplicada desde ahora");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  const small = "flex items-center gap-1.5 text-xs font-semibold text-muted-foreground [&_svg]:size-3.5";

  return (
    <div>
      <div className="my-3 grid gap-2">
        <div className="rounded-[14px] bg-muted px-3.5 py-2.5">
          <small className={small}>{isVes ? "Tasa vigente hoy · BCV oficial" : "Tasa vigente"}</small>
          <b className="my-0.5 block text-2xl tracking-[-0.03em] tabular-nums">
            {bigRate}
            {rate != null && <span className="text-sm font-normal text-muted-foreground"> / {refSymbol}</span>}
          </b>
          <small className={small}>
            {updated ? `Actualizada: ${updated}` : "Nunca se ha configurado"}
            {isVes && info?.currentValueDate ? ` · fecha valor ${formatValueDate(info.currentValueDate)}` : ""}
            {isVes ? " · Fuente: bcv.org.ve" : ""}
          </small>
        </div>
        {isVes &&
          (info?.next ? (
            <div className="rounded-[14px] bg-accent px-3.5 py-2.5">
              <small className={`${small} text-primary`}>
                <ClockIcon aria-hidden /> Próxima tasa · BCV, fecha valor {formatValueDate(info.next.valueDate)}
              </small>
              <b className="my-0.5 block text-2xl tracking-[-0.03em] tabular-nums">Bs {fmtRate(info.next.rate)}</b>
              <small className={small}>Se aplica sola hoy a las 7:00 p. m. y puedes adelantarla ahora</small>
            </div>
          ) : (
            <div className="rounded-[14px] bg-accent px-3.5 py-2.5">
              <small className={`${small} text-primary`}>
                <ClockIcon aria-hidden /> Verificación automática
              </small>
              <b className="my-0.5 block text-2xl tracking-[-0.03em]">12:00 a. m.</b>
              <small className={small}>Cada noche confirma que la tasa activa coincide con la del BCV</small>
            </div>
          ))}
      </div>

      {stale && (
        <p className="mb-2 text-[13px] text-destructive">
          {rate != null
            ? "No has actualizado la tasa hoy. Los precios en tu moneda local pueden estar desactualizados."
            : "Configura una tasa para poder ver precios en tu moneda local y completar ventas."}
        </p>
      )}

      {isVes && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground" aria-label="Cómo se actualiza">
            <span className="rounded-full bg-ok-solid/14 px-2.5 py-1 text-success">7:00 p. m. · toma la tasa del día siguiente y la activa</span>
            <i className="h-0.5 w-[22px] bg-border" />
            <span className="rounded-full bg-ok-solid/14 px-2.5 py-1 text-success">12:00 a. m. · la verifica</span>
          </div>
          <Note className="mb-2 mt-0">Se actualiza sola todos los días, sin que hagas nada.</Note>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={isPending} onClick={refresh}>
              <SparklesIcon aria-hidden /> {isPending ? "Consultando BCV..." : "Actualizar tasa ahora"}
            </Button>
            {info?.next && (
              <Button variant="outline" disabled={isPending} onClick={advance}>
                Adelantar la próxima tasa
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
