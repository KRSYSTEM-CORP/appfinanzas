import { HBars, StatsCard } from "@/components/finance/StatsUi";
import s from "@/components/finance/stats.module.css";
import { formatCurrencyCents } from "@/lib/currencies";
import { inventoryDays, rotationStatus } from "@/lib/stats-view";
import type { PurchasedProductRow, RotationRow } from "@/lib/actions/reports";

const und = (v: number) => `${v.toLocaleString("es-VE")} und.`;

// Lo que más compramos · Mayor rotación. Más/Menos vendidos viven en «Rendimiento
// de productos» (ParetoChart).
export function StatsInsights({
  purchased,
  rotation,
  days,
  periodLabel,
  currency,
}: {
  purchased: PurchasedProductRow[];
  rotation: RotationRow[];
  days: number;
  periodLabel: string;
  currency: string;
}) {
  const money = (c: number) => formatCurrencyCents(currency, c);
  const buy5 = purchased.slice(0, 5);
  const rot5 = rotation.slice(0, 5).map((r) => ({ ...r, days: inventoryDays(r.stock, r.sold, days) }));

  return (
    <>
      <div className={`${s.grid} ${s.g2}`}>
        <StatsCard title="Lo que más compramos" sub={`Unidades pedidas a proveedores · ${periodLabel}`}>
          {buy5.length === 0 ? (
            <p className={s.empty}>Sin compras en este período.</p>
          ) : (
            <>
              <HBars rows={buy5.map((x) => ({ label: x.name, value: x.quantity, display: und(x.quantity), color: "var(--chart-2)", title: `${x.name}: ${und(x.quantity)} · ${money(x.totalCents)}` }))} />
              <p className={s.note}>
                Más pedido: <b>{buy5[0].name}</b> ({money(buy5[0].totalCents)} en compras).
              </p>
            </>
          )}
        </StatsCard>
        <StatsCard title="Mayor rotación" sub="Veces que se renueva el stock · días de inventario">
          {rot5.length === 0 ? (
            <p className={s.empty}>Sin ventas de productos con control de stock.</p>
          ) : (
            <>
              {rot5.map((x, i) => {
                const st = rotationStatus(x.days);
                return (
                  <div key={x.name} className={`${s.li} ${s.a} ${s.fadeUp}`} style={{ ["--i" as string]: i }}>
                    <div>
                      <b>{x.name}</b>
                      <small>{x.days >= 999 ? "Sin ventas" : `${x.days} ${x.days === 1 ? "día" : "días"} de inventario`}</small>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className={s.pill} data-tone={st.tone}>
                        {st.label}
                      </span>
                      <b className={s.mono}>{x.turns.toLocaleString("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×</b>
                    </div>
                  </div>
                );
              })}
              <p className={s.note}>Rotación = unidades vendidas ÷ stock actual. Alta rotación con poco stock: pide más a tus proveedores.</p>
            </>
          )}
        </StatsCard>
      </div>
    </>
  );
}
