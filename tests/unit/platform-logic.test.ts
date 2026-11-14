import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS, announcementVisible, companyState, csvCell, daysUntilDue, fillTemplate, filterCompanies,
  inSegment, platformKpis, selectRecipients, usageLine, whatsappUrl, type PlatformCompany,
} from "@/lib/platform-logic";

const now = new Date("2026-11-16T15:00:00Z");
const d = (iso: string) => new Date(iso + "T12:00:00Z");
const mk = (o: Partial<PlatformCompany> & { id: string }): PlatformCompany => ({
  name: o.id, plan: "PYME", isExempt: false, nextPaymentDueDate: d("2026-12-30"), ownerStatus: "ACTIVE",
  ownerEmail: `${o.id}@x.com`, createdAt: d("2026-01-01"), lastActivityAt: d("2026-11-15"), ...o,
});
const rows = [
  mk({ id: "a" }),
  mk({ id: "b", nextPaymentDueDate: d("2026-11-19"), plan: "EMPRENDE" }),
  mk({ id: "c", nextPaymentDueDate: d("2026-11-10") }),
  mk({ id: "d", ownerStatus: "PENDING", createdAt: d("2026-11-14") }),
  mk({ id: "e", ownerStatus: "SUSPENDED" }),
  mk({ id: "f", isExempt: true, nextPaymentDueDate: d("2026-11-01"), ownerEmail: "f@kyra.local" }),
  mk({ id: "g", nextPaymentDueDate: d("2026-11-16"), lastActivityAt: null }),
];

describe("estado y vencimiento", () => {
  it("días hasta el vencimiento", () => {
    expect(daysUntilDue(d("2026-11-16"), now)).toBe(0);
    expect(daysUntilDue(d("2026-11-19"), now)).toBe(3);
    expect(daysUntilDue(d("2026-11-10"), now)).toBe(-6);
    expect(daysUntilDue(null, now)).toBeNull();
  });
  it("clasifica cada empresa", () => {
    const s = Object.fromEntries(rows.map((r) => [r.id, companyState(r, now)]));
    expect(s).toEqual({ a: "active", b: "expiring", c: "overdue", d: "pending", e: "suspended", f: "exempt", g: "expiring" });
  });
});

describe("filtros", () => {
  it("busca por nombre o correo sin tildes", () => {
    expect(filterCompanies([mk({ id: "z", name: "Panadería Ñandú" })], { ...EMPTY_FILTERS, q: "panaderia" }, now)).toHaveLength(1);
    expect(filterCompanies(rows, { ...EMPTY_FILTERS, q: "b@x" }, now).map((r) => r.id)).toEqual(["b"]);
  });
  it("filtra por estado, plan y vencimiento", () => {
    expect(filterCompanies(rows, { ...EMPTY_FILTERS, state: "overdue" }, now).map((r) => r.id)).toEqual(["c"]);
    expect(filterCompanies(rows, { ...EMPTY_FILTERS, plan: "EMPRENDE" }, now).map((r) => r.id)).toEqual(["b"]);
    expect(filterCompanies(rows, { ...EMPTY_FILTERS, due: "today" }, now).map((r) => r.id)).toEqual(["g"]);
    expect(filterCompanies(rows, { ...EMPTY_FILTERS, due: "soon" }, now).map((r) => r.id)).toEqual(["b"]);
    expect(filterCompanies(rows, { ...EMPTY_FILTERS, due: "overdue" }, now).map((r) => r.id).sort()).toEqual(["c", "f"]);
  });
});

describe("KPIs", () => {
  it("cuenta por estado", () => {
    expect(platformKpis(rows, now, { monthIncomeUsdCents: 5000, pendingCreditRequests: 2 })).toEqual({
      active: 4, expiring: 2, overdueOrBlocked: 2, pending: 1, incomeUsdCents: 5000, creditRequests: 2,
    });
  });
});

describe("segmentos y destinatarios", () => {
  it("segmentos", () => {
    expect(inSegment(rows[3], "nuevas", now)).toBe(true);
    expect(inSegment(rows[0], "nuevas", now)).toBe(false);
    expect(inSegment(rows[6], "sin_actividad", now)).toBe(true);
    expect(inSegment(rows[0], "sin_actividad", now)).toBe(false);
    expect(inSegment(rows[1], "plan_EMPRENDE", now)).toBe(true);
  });
  it("excluye pendientes, suspendidas y correos de empleados", () => {
    const ids = (a: Parameters<typeof selectRecipients>[1]) => selectRecipients(rows, a, now).map((r) => r.id);
    expect(ids({ kind: "segment", segment: "todas" })).toEqual(["a", "b", "c", "g"]);
    expect(ids({ kind: "segment", segment: "por_vencer" })).toEqual(["b", "g"]);
    expect(ids({ kind: "segment", segment: "suspendidas" })).toEqual(["e"]);
    expect(ids({ kind: "selected", ids: ["a", "f", "e"] })).toEqual(["a", "e"]);
  });
});

describe("plantillas, WhatsApp, uso, avisos y CSV", () => {
  it("rellena variables", () => {
    const t = fillTemplate("{{empresa}} · {{plan}} · {{vencimiento}} · {{dias}} · {{otra}}", rows[1], now);
    expect(t).toBe("b · Emprende · 19 de noviembre de 2026 · en 3 días · {{otra}}");
    expect(fillTemplate("{{codigo}}", rows[1], now, { codigo: "NOV10" })).toBe("NOV10");
  });
  it("enlace de WhatsApp", () => {
    expect(whatsappUrl("0412-1234567")).toBe("https://wa.me/584121234567");
    expect(whatsappUrl("+58 412 1234567", "Hola")).toBe("https://wa.me/584121234567?text=Hola");
    expect(whatsappUrl("123")).toBeNull();
  });
  it("uso cerca del tope", () => {
    expect(usageLine(4, 5)).toMatchObject({ near: true, over: false });
    expect(usageLine(5, 5).over).toBe(true);
    expect(usageLine(500, null)).toMatchObject({ near: false, limit: null });
  });
  it("vigencia de un aviso", () => {
    expect(announcementVisible({ active: true, startsAt: null, endsAt: d("2026-11-20") }, now)).toBe(true);
    expect(announcementVisible({ active: true, startsAt: null, endsAt: d("2026-11-10") }, now)).toBe(false);
    expect(announcementVisible({ active: false, startsAt: null, endsAt: null }, now)).toBe(false);
    expect(announcementVisible({ active: true, startsAt: d("2026-11-20"), endsAt: null }, now)).toBe(false);
  });
  it("escapa CSV", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(null)).toBe("");
  });
});
