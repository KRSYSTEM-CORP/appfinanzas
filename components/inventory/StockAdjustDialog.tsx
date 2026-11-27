"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adjustStock } from "@/lib/actions/products";
import { addQty, formatQty, formatStock, getUnit, subQty, unitLabel } from "@/lib/units";

type Kind = "ENTRADA" | "SALIDA" | "CONTEO";

// Ajuste de existencias: Entrada, Salida o Conteo físico (fija la cantidad real).
export function StockAdjustDialog({ product, onClose }: { product: { id: string; name: string; stock: number; unit: string; unitLabel: string | null }; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("ENTRADA");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(qty);
  const after = Number.isFinite(n) && qty !== "" ? (kind === "ENTRADA" ? addQty(product.stock, n) : kind === "SALIDA" ? subQty(product.stock, n) : n) : null;

  function save() {
    setError(null);
    start(async () => {
      const r = await adjustStock(product.id, kind, n, note);
      if (r.success) {
        onClose();
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuste de existencias</DialogTitle>
          <DialogDescription>
            {product.name} · hoy hay {formatStock(product.stock, product.unit, product.unitLabel)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Segmented
            label="Tipo de ajuste"
            value={kind}
            onChange={setKind}
            options={[
              { value: "ENTRADA", label: "Entrada" },
              { value: "SALIDA", label: "Salida" },
              { value: "CONTEO", label: "Conteo físico" },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-qty">{kind === "CONTEO" ? "Cantidad contada" : "Cantidad"}</Label>
            <Input id="adj-qty" type="number" min="0" step={getUnit(product.unit).decimals ? "0.001" : "1"} inputMode={getUnit(product.unit).decimals ? "decimal" : "numeric"} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-note">Motivo (opcional)</Label>
            <Input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Merma, reposición" />
          </div>
          {after !== null && (
            <p className={`text-sm ${after < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              Quedarán <b>{formatQty(after)}</b> {unitLabel(product.unit, after, product.unitLabel)}.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || qty === "" || (after !== null && after < 0)} onClick={save}>
            Guardar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
