"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { registerInternalUse } from "@/lib/actions/products";

type Option = { id: string; name: string; stock: number };

// Consumo interno: sacar mercancía del inventario para uso de la propia empresa.
export function InternalUseButton({ products }: { products: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"SOCIO" | "PERSONAL">("SOCIO");
  const [who, setWho] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const q = search.trim().toLowerCase();
  const matches = (q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products).slice(0, 8);
  const selected = products.find((p) => p.id === productId);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await registerInternalUse(productId, Number(quantity), note, who.trim() ? { kind, name: who } : undefined);
      if (result.success) {
        setOpen(false);
        setSearch("");
        setProductId("");
        setQuantity("1");
        setNote("");
        setWho("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Consumo interno
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consumo interno</DialogTitle>
            <DialogDescription>
              Mercancía que usa tu propio negocio (no es una venta). Descuenta el stock y queda en el historial.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iu-search">Producto</Label>
              <Input
                id="iu-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Busca por nombre…"
              />
              <div className="flex max-h-44 flex-col overflow-y-auto rounded-md border">
                {matches.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">Sin resultados</p>
                ) : (
                  matches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProductId(p.id)}
                      aria-pressed={productId === p.id}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted ${
                        productId === p.id ? "bg-primary/10 font-medium text-primary" : ""
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.stock} en stock</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="iu-qty">Cantidad</Label>
                <Input
                  id="iu-qty"
                  type="number"
                  min="1"
                  max={selected?.stock}
                  step="1"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="iu-note">Motivo (opcional)</Label>
                <Input id="iu-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Muestra" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="iu-kind">Quién retira</Label>
                <select id="iu-kind" value={kind} onChange={(e) => setKind(e.target.value as "SOCIO" | "PERSONAL")} className="h-10 rounded-xl border bg-background px-2 text-sm">
                  <option value="SOCIO">Socio</option>
                  <option value="PERSONAL">Personal</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="iu-who">Nombre</Label>
                <Input id="iu-who" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Ej. Carlos" />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button disabled={isPending || !productId} onClick={save}>
              Registrar consumo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
