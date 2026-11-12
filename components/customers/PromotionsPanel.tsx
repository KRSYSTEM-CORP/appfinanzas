"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/ui/chip";
import { createPromotion, registerRedemption, type PromotionRow } from "@/lib/actions/marketing";
import { promotionMessage, whatsappLink } from "@/lib/marketing";

const SEGMENT_OPTIONS = [
  ["todos", "Todos"],
  ["campeones", "Campeones"],
  ["leales", "Leales"],
  ["riesgo", "En riesgo"],
  ["dormidos", "Dormidos"],
  ["cumpleaneros", "Cumpleañeros"],
] as const;

// Promociones: lista de clientes + descuento + vigencia → código y vista previa del WhatsApp; canjes.
export function PromotionsPanel({ promotions, businessName }: { promotions: PromotionRow[]; businessName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now] = useState(() => Date.now());
  const [name, setName] = useState("");
  const [discount, setDiscount] = useState("10");
  const [days, setDays] = useState("15");
  const [segment, setSegment] = useState<(typeof SEGMENT_OPTIONS)[number][0]>("todos");
  const preview = promotionMessage({ name: name || "Tu promoción", code: "CÓDIGO", discountPercent: Number(discount) || 0, validUntil: new Date(now + (Number(days) || 0) * 86_400_000) }, businessName);

  function create() {
    start(async () => {
      const r = await createPromotion({ name, discountPercent: Number(discount), days: Number(days), segment });
      if (!r.success) toast.error(r.error);
      else {
        setName("");
        toast.success("Promoción creada");
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="flex flex-col gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
        <h2 className="font-bold">Nueva promoción</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="promo-name">Nombre</Label>
          <Input id="promo-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Vuelve y ahorra" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-discount">Descuento (%)</Label>
            <Input id="promo-discount" type="number" min="1" max="90" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-days">Vigencia (días)</Label>
            <Input id="promo-days" type="number" min="1" max="90" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Lista de clientes">
          {SEGMENT_OPTIONS.map(([id, label]) => (
            <Chip key={id} active={segment === id} onClick={() => setSegment(id)}>
              {label}
            </Chip>
          ))}
        </div>
        <p className="rounded-[14px] bg-muted p-3 text-sm">{preview}</p>
        <Button type="button" size="lg" disabled={pending || name.trim().length < 2} onClick={create}>
          Crear promoción
        </Button>
      </section>
      <section className="flex flex-col gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
        <h2 className="font-bold">Códigos activos</h2>
        {promotions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay promociones.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {promotions.map((p) => {
              const expired = new Date(p.validUntil).getTime() < now;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {p.name} · <span className="tabular-nums">{p.code}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.discountPercent} % · {SEGMENT_OPTIONS.find((s) => s[0] === p.segment)?.[1]} · {expired ? "Vencida" : `hasta ${new Date(p.validUntil).toLocaleDateString("es-VE")}`} · {p.redemptions} canje{p.redemptions === 1 ? "" : "s"}
                    </p>
                  </div>
                  <a
                    href={whatsappLink("", promotionMessage(p, businessName))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 text-xs font-bold text-primary"
                  >
                    WhatsApp
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || expired}
                    onClick={() =>
                      start(async () => {
                        const r = await registerRedemption(p.id);
                        if (!r.success) toast.error(r.error);
                        router.refresh();
                      })
                    }
                  >
                    Registrar canje
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
