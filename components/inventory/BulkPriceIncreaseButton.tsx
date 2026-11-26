"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrendingUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FIELD_CONTROL } from "@/components/shared/Field";
import { formatCurrencyCents } from "@/lib/currencies";
import { parsePercentBp, type PriceRounding } from "@/lib/price-increase";
import {
  bulkIncreasePrices,
  previewPriceIncrease,
  undoLastPriceAdjustment,
  type LastPriceAdjustment,
  type PriceIncreasePreview,
} from "@/lib/actions/price-adjustments";

const SHORTCUTS = ["5", "10", "15"];

function pct(bp: number) {
  return `${(bp / 100).toLocaleString("es-VE", { maximumFractionDigits: 2 })} %`;
}

// Aumentar precios en porcentaje: atajos, vista previa con ejemplos, confirmación y deshacer (24 h).
export function BulkPriceIncreaseButton({
  categories,
  referenceCurrency,
  last,
  className,
}: {
  categories: string[];
  referenceCurrency: string;
  last: LastPriceAdjustment | null;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState("10");
  const [rounding, setRounding] = useState<PriceRounding>("CENT");
  const [scope, setScope] = useState<"all" | "category">("all");
  const [category, setCategory] = useState("");
  const [preview, setPreview] = useState<PriceIncreasePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const bp = parsePercentBp(percent);
  const cat = scope === "category" ? category : "";
  const scopeReady = scope === "all" || category !== "";

  function reset() {
    setPreview(null);
    setError(null);
  }
  function close() {
    setOpen(false);
    setPreview(null);
    setError(null);
    setDone(null);
  }

  function doPreview() {
    setError(null);
    setDone(null);
    start(async () => {
      const r = await previewPriceIncrease({ percent, rounding, category: cat });
      if (r.success) setPreview(r);
      else setError(r.error);
    });
  }
  function apply() {
    if (!preview) return;
    start(async () => {
      const r = await bulkIncreasePrices({ percent, rounding, category: cat, expectedCount: preview.count });
      if (r.success) {
        setDone(`Listo: subimos ${pct(bp ?? 0)} a ${r.count} ${r.count === 1 ? "producto" : "productos"}. Puedes deshacerlo durante 24 horas.`);
        setPreview(null);
        router.refresh();
      } else {
        setError(r.error);
        setPreview(null);
      }
    });
  }
  function undo() {
    setError(null);
    start(async () => {
      const r = await undoLastPriceAdjustment();
      if (r.success) {
        setDone(
          r.skipped > 0
            ? `Devolvimos los precios anteriores de ${r.restored} productos. ${r.skipped} se habían editado a mano y los dejamos como están.`
            : `Devolvimos los precios anteriores de ${r.restored} productos.`
        );
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <>
      <Button type="button" size="lg" variant="outline" className={className} onClick={() => setOpen(true)}>
        <TrendingUpIcon data-icon="inline-start" /> Aumentar precios
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aumentar precios</DialogTitle>
            <DialogDescription>
              Sube de una vez los precios de venta (detal, mayor y gran mayor). Los costos no cambian.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inc-pct">¿Cuánto quieres subir? (%)</Label>
              <div className="flex flex-wrap items-center gap-2">
                {SHORTCUTS.map((s) => (
                  <Button key={s} type="button" size="sm" variant={percent === s ? "default" : "outline"} aria-pressed={percent === s} onClick={() => { setPercent(s); reset(); }}>
                    {s} %
                  </Button>
                ))}
                <Input
                  id="inc-pct"
                  className="w-28"
                  inputMode="decimal"
                  placeholder="Otro %"
                  value={percent}
                  onChange={(e) => { setPercent(e.target.value); reset(); }}
                />
              </div>
              {bp == null && percent.trim() !== "" && <p className="text-xs text-destructive">Escribe un número entre 0,01 y 100.</p>}
            </div>
            <Segmented
              label="Redondeo"
              value={rounding}
              onChange={(v) => { setRounding(v); reset(); }}
              options={[
                { value: "CENT", label: "Al céntimo" },
                { value: "0.05", label: "A 0,05" },
                { value: "0.10", label: "A 0,10" },
              ]}
            />
            <Segmented
              label="Alcance"
              value={scope}
              onChange={(v) => { setScope(v); reset(); }}
              options={[
                { value: "all", label: "Todos los productos activos" },
                { value: "category", label: "Una categoría" },
              ]}
            />
            {scope === "category" && (
              <select aria-label="Categoría" className={FIELD_CONTROL} value={category} onChange={(e) => { setCategory(e.target.value); reset(); }}>
                <option value="">Elige una categoría</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            {preview && (
              <div className="flex flex-col gap-1.5 rounded-[14px] bg-muted p-3 text-sm">
                <p>
                  Se van a cambiar <b>{preview.count}</b> {preview.count === 1 ? "producto" : "productos"} (+{pct(bp ?? 0)}). Así quedarían:
                </p>
                {preview.samples.map((s) => (
                  <p key={s.name} className="flex justify-between gap-3 tabular-nums">
                    <span className="min-w-0 truncate">{s.name}</span>
                    <span className="shrink-0">
                      {formatCurrencyCents(referenceCurrency, s.beforeCents)} → <b>{formatCurrencyCents(referenceCurrency, s.afterCents)}</b>
                    </span>
                  </p>
                ))}
                <p className="text-xs text-muted-foreground">Confirma solo si los precios te parecen bien. Podrás deshacerlo durante 24 horas.</p>
              </div>
            )}
            {done && <p role="status" className="text-sm font-semibold text-primary">{done}</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            {last && !last.undoneAt && last.canUndo && !done && (
              <div className="flex items-center justify-between gap-3 rounded-[14px] border p-3 text-sm">
                <span>
                  Último ajuste: +{pct(last.percentBp)} a {last.productCount} productos ({new Date(last.createdAt).toLocaleString("es-VE")}, {last.actorName}).
                </span>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={undo}>
                  Deshacer
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {done ? "Cerrar" : "Cancelar"}
            </Button>
            {preview ? (
              <Button disabled={pending || preview.count === 0} onClick={apply}>
                Sí, aumentar {pct(bp ?? 0)}
              </Button>
            ) : (
              <Button disabled={pending || bp == null || !scopeReady} onClick={doPreview}>
                Ver vista previa
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
