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
    <div className="flex items-center gap-1 flex-wrap">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => apply(o.value)}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value
              ? "bg-primary text-primary-foreground border-primary"
              : "border-input hover:bg-accent"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
