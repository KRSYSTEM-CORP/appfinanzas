"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, DownloadIcon, EyeIcon, FileTextIcon, ImageIcon } from "lucide-react";
import { buildAssistantReportPDF } from "@/lib/assistant-report-pdf";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { ResolvedBlock, ResolvedChart, ResolvedProducts, ResolvedTable, SalePreview } from "@/lib/assistant-types";

const card = "mt-2 overflow-hidden rounded-2xl bg-card p-3 shadow-(--shadow-card)";

// Gráfico de barras o línea en SVG (sin librerías): valores reales ya consultados por el servidor.
function Chart({ b }: { b: ResolvedChart }) {
  const pts = b.points.slice(-24);
  const max = Math.max(1, ...pts.map((p) => p.value));
  const W = 520;
  const H = 190;
  const padB = 38;
  const padT = 12;
  const ch = H - padB - padT;
  const step = W / Math.max(1, pts.length);
  const x = (i: number) => i * step + step / 2;
  const y = (v: number) => padT + ch - (v / max) * ch;
  return (
    <div className={card}>
      <p className="mb-1 text-[13px] font-bold">{b.title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={b.title}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={0} x2={W} y1={y(max * g)} y2={y(max * g)} stroke="currentColor" opacity={0.08} />
        ))}
        {b.kind === "line" && pts.length > 1 ? (
          <>
            <polyline fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" points={pts.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
            {pts.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill="var(--primary)">
                <title>{`${p.label}: ${p.display}`}</title>
              </circle>
            ))}
          </>
        ) : (
          pts.map((p, i) => (
            <rect key={i} x={x(i) - Math.min(step * 0.34, 22)} y={y(p.value)} width={Math.min(step * 0.68, 44)} height={Math.max(2, padT + ch - y(p.value))} rx={5} fill="var(--primary)" opacity={0.9}>
              <title>{`${p.label}: ${p.display}`}</title>
            </rect>
          ))
        )}
        {pts.map((p, i) =>
          pts.length <= 12 || i % Math.ceil(pts.length / 12) === 0 ? (
            <text key={i} x={x(i)} y={H - 18} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.6}>
              {p.label}
            </text>
          ) : null
        )}
      </svg>
      <p className="text-xs text-muted-foreground">
        Máximo: {pts.find((p) => p.value === max)?.display} · {pts.length} {pts.length === 1 ? "punto" : "puntos"}
      </p>
    </div>
  );
}

// Tabla con vista previa y descarga del PDF (se genera en el navegador con los mismos datos).
function Table({ b, company }: { b: ResolvedTable; company: DeliveryNoteCompany }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function preview() {
    if (url) return setUrl(null);
    setBusy(true);
    try {
      const doc = await buildAssistantReportPDF(b, company);
      setUrl(URL.createObjectURL(doc.output("blob") as Blob));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    try {
      const doc = await buildAssistantReportPDF(b, company);
      doc.save(`${b.dataset}-${b.from}_${b.to}.pdf`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold">{b.title}</p>
          <p className="text-xs text-muted-foreground">{b.subtitle}</p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={preview} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-semibold text-primary">
            <EyeIcon className="size-3.5" aria-hidden /> {url ? "Ocultar PDF" : "Vista previa PDF"}
          </button>
          <button type="button" onClick={download} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">
            <DownloadIcon className="size-3.5" aria-hidden /> Descargar PDF
          </button>
        </div>
      </div>
      {b.rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Sin datos en este período.</p>
      ) : (
        <div className="-mx-1 mt-2 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {b.columns.map((c, i) => (
                  <th key={c} className={`px-1.5 py-1.5 font-semibold ${i === b.columns.length - 1 ? "text-right" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className="border-b last:border-0">
                  {r.map((c, i) => (
                    <td key={i} className={`px-1.5 py-1.5 tabular-nums ${i === r.length - 1 ? "text-right font-semibold" : ""}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {b.totals && (
              <tfoot>
                <tr className="border-t-2 font-bold">
                  {b.totals.map((c, i) => (
                    <td key={i} className={`px-1.5 py-1.5 tabular-nums ${i === b.totals!.length - 1 ? "text-right" : ""}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {url && (
        <div className="mt-3 overflow-hidden rounded-xl border">
          <iframe title={`Vista previa: ${b.title}`} src={url} className="h-[420px] w-full" />
        </div>
      )}
    </div>
  );
}

function Products({ b }: { b: ResolvedProducts }) {
  return (
    <div className={card}>
      <p className="mb-2 text-[13px] font-bold">{b.title}</p>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        {b.items.map((it) => (
          <div key={it.id} className="flex flex-col overflow-hidden rounded-xl bg-muted/60">
            <div className="grid aspect-[4/3] place-items-center bg-muted">
              {it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.imageUrl} alt={it.name} loading="lazy" className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-7 text-muted-foreground/60" aria-hidden />
              )}
            </div>
            <div className="p-2.5">
              <p className="text-[13px] font-bold leading-tight">{it.name}</p>
              <p className="text-xs text-muted-foreground">{it.category ?? "Sin categoría"}</p>
              <p className="mt-1 text-sm font-extrabold tabular-nums">{it.price}</p>
              <p className="text-xs text-muted-foreground">{it.stock}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssistantBlocks({ blocks, company }: { blocks: ResolvedBlock[]; company: DeliveryNoteCompany }) {
  if (!blocks.length) return null;
  return (
    <div className="flex flex-col">
      {blocks.map((b, i) =>
        b.type === "chart" ? (
          <Chart key={i} b={b} />
        ) : b.type === "table" ? (
          <Table key={i} b={b} company={company} />
        ) : b.type === "products" ? (
          <Products key={i} b={b} />
        ) : (
          <Link key={i} href={b.href} className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/12 px-3.5 py-2 text-[13px] font-semibold text-primary">
            <FileTextIcon className="size-4" aria-hidden /> {b.label} <ArrowUpRightIcon className="size-3.5" aria-hidden />
          </Link>
        )
      )}
    </div>
  );
}

// Vista previa EXACTA de la venta que propone el asistente (precios y stock reales).
export function SalePreviewCard({ p }: { p: SalePreview }) {
  return (
    <div className="mt-2 rounded-xl bg-muted/60 p-3">
      <p className="mb-1.5 text-[13px] font-bold">Vista previa de la venta</p>
      {p.lines.map((l, i) => (
        <div key={i} className="flex items-start justify-between gap-2 border-b py-1.5 text-[13px] last:border-0">
          <span className="min-w-0">
            {l.quantity} × {l.name}
            <span className="block text-xs text-muted-foreground">{l.unit} c/u</span>
          </span>
          <b className="tabular-nums">{l.subtotal}</b>
        </div>
      ))}
      {p.discountPercent > 0 && <p className="mt-1 text-xs text-muted-foreground">Descuento aplicado: {p.discountPercent} %</p>}
      <div className="mt-1.5 flex items-center justify-between border-t-2 pt-1.5 text-sm">
        <span className="font-bold">Total</span>
        <b className="text-base tabular-nums">{p.total}</b>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Cliente: {p.customer} · {p.paymentLabel}
      </p>
      {p.issues.length > 0 && (
        <ul className="mt-2 list-disc rounded-lg bg-destructive/10 py-2 pl-6 pr-3 text-xs font-semibold text-destructive">
          {p.issues.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
