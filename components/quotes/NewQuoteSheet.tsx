"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import type { ReferenceCurrency } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createQuote, getQuote, markQuoteStage } from "@/lib/actions/quotes";
import { formatCurrencyCents } from "@/lib/currencies";
import { whatsappLink } from "@/lib/marketing";
import { QUOTE_VALID_DAYS } from "@/lib/quote-follow-up";
import type { ListedProduct } from "@/lib/product-image";

type Line = { productId: string; name: string; unitPriceCents: number; quantity: number };

const FIELD = "min-h-[46px] w-full rounded-[12px] border border-input bg-background px-3 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const LABEL = "flex flex-col gap-1.5 text-[13px] font-semibold text-muted-foreground";

// «Nuevo presupuesto» como hoja única (cliente, productos, vigencia, nota), como en la preview.
// Usa las mismas acciones del servidor que la pantalla de creación (createQuote, markQuoteStage).
export function NewQuoteButton({
  products,
  referenceCurrency,
}: {
  products: ListedProduct[];
  referenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [lines, setLines] = useState<Line[]>([]);
  const [validDays, setValidDays] = useState<7 | 15 | 30>(15);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);
  const subtotal = lines.reduce((t, l) => t + l.unitPriceCents * l.quantity, 0);

  function reset() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setQty("1");
    setLines([]);
    setValidDays(15);
    setNote("");
    setError(null);
  }

  function addLine() {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const quantity = Math.max(1, parseInt(qty, 10) || 1);
    setError(null);
    setLines((prev) => {
      const ex = prev.find((l) => l.productId === p.id);
      if (ex) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + quantity } : l));
      return [...prev, { productId: p.id, name: p.name, unitPriceCents: p.priceCents, quantity }];
    });
  }

  function save(sendWhatsapp: boolean) {
    if (lines.length === 0) {
      setError("Agrega al menos un producto");
      return;
    }
    // Se abre antes del await para que el navegador no bloquee la ventana.
    const win = sendWhatsapp ? window.open("about:blank", "_blank") : null;
    setError(null);
    startTransition(async () => {
      const result = await createQuote({
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        customerFirstName: firstName,
        customerLastName: lastName,
        customerPhone: phone,
        customerAddress: "",
        note: note.trim() || undefined,
        useLocalCurrency: true,
        validDays,
      });
      if (!result.success) {
        win?.close();
        setError(result.error);
        return;
      }
      if (sendWhatsapp) {
        await markQuoteStage(result.quoteId, "SENT", true);
        const quote = await getQuote(result.quoteId);
        const msg = `Hola ${firstName.trim()}, te envío el presupuesto PRE-${quote?.controlNumber ?? ""} por ${money(subtotal)} (vigente ${validDays} días). ¿Lo confirmamos?`;
        if (win) win.location.href = whatsappLink(phone, msg);
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="lg" onClick={() => setOpen(true)}>
        <PlusIcon className="size-[18px]" aria-hidden /> Nuevo presupuesto
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-bold tracking-[-0.02em]">Nuevo presupuesto</DialogTitle>
          <DialogDescription>No descuenta inventario hasta convertirse en venta</DialogDescription>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <label className={LABEL}>
              Nombre
              <input className={FIELD} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" />
            </label>
            <label className={LABEL}>
              Apellido
              <input className={FIELD} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
            </label>
          </div>
          <label className={LABEL}>
            Teléfono
            <input className={FIELD} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </label>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <label className={LABEL}>
              Producto
              <select className={FIELD} value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.priceCents)}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Cantidad
              <input className={FIELD} type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
          </div>
          <div>
            <Button type="button" variant="secondary" onClick={addLine} disabled={!productId}>
              <PlusIcon className="size-[18px]" aria-hidden /> Agregar producto
            </Button>
          </div>
          <div className="flex flex-col">
            {lines.length === 0 ? (
              <p className="my-1.5 text-sm text-muted-foreground">Agrega al menos un producto.</p>
            ) : (
              <>
                {lines.map((l) => (
                  <div key={l.productId} className="flex items-center justify-between gap-2.5 border-b py-2.5 text-sm">
                    <span>
                      {l.quantity} × {l.name}
                    </span>
                    <b className="tabular-nums">{money(l.unitPriceCents * l.quantity)}</b>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2.5 py-2.5 text-sm">
                  <b>Subtotal</b>
                  <b className="tabular-nums">{money(subtotal)}</b>
                </div>
              </>
            )}
          </div>
          <label className={LABEL}>
            Vigencia
            <select className={FIELD} value={validDays} onChange={(e) => setValidDays(Number(e.target.value) as 7 | 15 | 30)}>
              {QUOTE_VALID_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} días
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Nota para el cliente (opcional)
            <textarea
              className="min-h-[76px] w-full rounded-[12px] border border-input bg-background px-3 py-2.5 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Ej: precios válidos por 15 días"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Button type="button" disabled={isPending} onClick={() => save(true)}>
              Crear y enviar por WhatsApp
            </Button>
            <Button type="button" variant="secondary" disabled={isPending} onClick={() => save(false)}>
              Guardar
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
