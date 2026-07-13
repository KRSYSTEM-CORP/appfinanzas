import { eurCentsToVES, formatEUR, formatVES } from "@/lib/format";

export function Price({
  eurCents,
  rate,
  size = "sm",
  className,
}: {
  eurCents: number;
  rate: number | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span className={`inline-flex flex-col ${className ?? ""}`}>
      <span className={size === "lg" ? "text-lg font-semibold" : "font-medium"}>
        {rate != null ? formatVES(eurCentsToVES(eurCents, rate)) : "—"}
      </span>
      <span className="text-xs text-muted-foreground">{formatEUR(eurCents)}</span>
    </span>
  );
}
