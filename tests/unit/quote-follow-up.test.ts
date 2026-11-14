import { describe, expect, it } from "vitest";
import { closeProbability, expiryPill, nextStepSuggestion } from "@/lib/quote-follow-up";

const now = new Date("2026-11-13T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("expiryPill", () => {
  it("usa los umbrales de la preview", () => {
    expect(expiryPill(15)).toEqual({ label: "Vigente · 15 d", tone: "ok" });
    expect(expiryPill(4)).toEqual({ label: "Vence en 4 d", tone: "warn" });
    expect(expiryPill(-1)).toEqual({ label: "Vencido hace 1 d", tone: "bad" });
    expect(expiryPill(null)).toBeNull();
  });
});

describe("nextStepSuggestion", () => {
  it("elige el texto según vigencia y apertura", () => {
    const base = { status: "PENDING", sentAt: day(-1), viewedAt: null as Date | null };
    expect(nextStepSuggestion({ ...base, validUntil: day(-2) }, now)).toMatch(/^Venció/);
    expect(nextStepSuggestion({ ...base, validUntil: day(10) }, now)).toMatch(/^Aún no lo abre/);
    expect(nextStepSuggestion({ ...base, viewedAt: day(-1), validUntil: day(3) }, now)).toMatch(/^Está por vencer/);
    expect(nextStepSuggestion({ ...base, viewedAt: day(-1), validUntil: day(10) }, now)).toMatch(/^Lo abrió/);
    expect(nextStepSuggestion({ ...base, status: "LOST", validUntil: day(10) }, now)).toBeNull();
  });
});

describe("closeProbability", () => {
  it("sube si lo abrió y baja si venció", () => {
    const q = { status: "PENDING", createdAt: day(-1), sentAt: day(-1), viewedAt: null as Date | null, validUntil: day(10) };
    expect(closeProbability({ ...q, viewedAt: day(-1) }, 0, now)).toBeGreaterThan(closeProbability(q, 0, now));
    expect(closeProbability({ ...q, validUntil: day(-3) }, 0, now)).toBeLessThanOrEqual(25);
    expect(closeProbability({ ...q, status: "CONVERTED" }, 0, now)).toBe(100);
    expect(closeProbability({ ...q, status: "LOST" }, 0, now)).toBe(0);
  });
});
