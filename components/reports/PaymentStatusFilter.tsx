"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const OPTIONS: { value: "" | "PAID" | "CREDIT"; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "PAID", label: "Pagadas" },
  { value: "CREDIT", label: "A crédito" },
];

// Segments the Ventas table on /reports by paymentStatus — separate control
// from DateRangeSwitcher (a different axis: when vs. how it was paid), URL-
// driven the same way so the filter survives a refresh/share.
export function PaymentStatusFilter({ value }: { value: "" | "PAID" | "CREDIT" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(next: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (next) query.set("status", next);
    else query.delete("status");
    router.push(`${pathname}?${query.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5 w-fit max-w-full">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => apply(o.value)}
          className={`min-h-[38px] rounded-xl border-2 px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
            value === o.value
              ? "border-primary bg-primary/12 text-primary"
              : "border-transparent bg-muted text-foreground hover:bg-muted/70"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const CHANNELS: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "MOSTRADOR", label: "Mostrador" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "PICKUP", label: "Pick-up" },
  { value: "ONLINE", label: "Online" },
];

// Filtro por canal de venta (Caja Chica → Ventas), por URL como el de estado.
export function ChannelFilter({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(next: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (next) query.set("channel", next);
    else query.delete("channel");
    router.push(`${pathname}?${query.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5 w-fit max-w-full">
      {CHANNELS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => apply(o.value)}
          className={`min-h-[38px] rounded-xl border-2 px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
            value === o.value ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted text-foreground hover:bg-muted/70"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
