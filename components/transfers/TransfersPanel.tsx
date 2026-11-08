"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import {
  createTransfer,
  listTransferableProducts,
  type TransferRow,
  type TransferableProduct,
} from "@/lib/actions/transfers";

type Branch = { id: string; name: string };

export function TransfersPanel({
  branches,
  defaultFromId,
  transfers,
}: {
  branches: Branch[];
  defaultFromId: string;
  transfers: TransferRow[];
}) {
  const router = useRouter();
  const [fromId, setFromId] = useState(defaultFromId);
  const [toId, setToId] = useState(branches.find((b) => b.id !== defaultFromId)?.id ?? "");
  const [products, setProducts] = useState<TransferableProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    listTransferableProducts(fromId)
      .then((rows) => alive && setProducts(rows))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fromId]);

  const q = search.trim().toLowerCase();
  const shown = (q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)) : products).slice(0, 30);
  const lines = Object.entries(qty)
    .map(([productId, v]) => ({ productId, quantity: Math.floor(Number(v)) }))
    .filter((l) => l.quantity > 0);
  const totalUnits = lines.reduce((a, l) => a + l.quantity, 0);

  function changeFrom(id: string) {
    setFromId(id);
    setQty({});
    if (id === toId) setToId(branches.find((b) => b.id !== id)?.id ?? "");
  }

  function submit() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await createTransfer({ fromBranchId: fromId, toBranchId: toId, note, items: lines });
      if (result.success) {
        setQty({});
        setNote("");
        setDone(true);
        setProducts(await listTransferableProducts(fromId));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const select = "h-9 w-full rounded-md border bg-background px-2 text-sm";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo traspaso</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tr-from">Sale de</Label>
              <select id="tr-from" className={select} value={fromId} onChange={(e) => changeFrom(e.target.value)}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <ArrowRightIcon className="mb-2 hidden size-4 text-muted-foreground sm:block" aria-hidden />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tr-to">Llega a</Label>
              <select id="tr-to" className={select} value={toId} onChange={(e) => setToId(e.target.value)}>
                {branches.filter((b) => b.id !== fromId).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tr-search">Productos del origen</Label>
            <Input id="tr-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca por nombre o SKU…" />
            <div className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border">
              {loading ? (
                <p className="p-3 text-sm text-muted-foreground">Cargando…</p>
              ) : shown.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No hay productos con existencias en esta sucursal.</p>
              ) : (
                shown.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku ? `${p.sku} · ` : ""}
                        {p.stock} en stock
                      </p>
                    </div>
                    <Input
                      aria-label={`Cantidad a traspasar de ${p.name}`}
                      type="number"
                      min="0"
                      max={p.stock}
                      step="1"
                      inputMode="numeric"
                      placeholder="0"
                      value={qty[p.id] ?? ""}
                      onChange={(e) => setQty((s) => ({ ...s, [p.id]: e.target.value }))}
                      className="h-8 w-20 text-right"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tr-note">Nota (opcional)</Label>
            <Input id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Reposición de fin de semana" />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {done && <p className="text-sm text-success">Traspaso registrado.</p>}
          <div className="flex items-center gap-3">
            <Button disabled={isPending || lines.length === 0 || !toId} onClick={submit}>
              Registrar traspaso
            </Button>
            <span className="text-sm text-muted-foreground">
              {lines.length} {lines.length === 1 ? "producto" : "productos"} · {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial de traspasos</CardTitle>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay traspasos.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {transfers.map((t) => (
                <div key={t.id} className="flex flex-col gap-1 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 font-medium">
                    {t.fromBranchName} <ArrowRightIcon className="size-3.5" aria-label="hacia" /> {t.toBranchName}
                    <span className="text-xs font-normal text-muted-foreground">
                      {formatDate(t.createdAt)} · {t.createdByName}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{t.items.map((i) => `${i.productName} ×${i.quantity}`).join(", ")}</p>
                  {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
