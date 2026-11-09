import { describe, expect, it } from "vitest";
import { renewalNotice } from "@/lib/renewal";

// 2026-11-10 12:00 en Venezuela (UTC-4) = 16:00 UTC.
const NOW = new Date("2026-11-10T16:00:00Z");
const due = (iso: string) => new Date(iso);

describe("aviso de renovación", () => {
  it("avisa «hoy» aunque falten pocas horas", () => {
    // Vence hoy a las 11:59 p. m. de Venezuela.
    const n = renewalNotice(due("2026-11-11T03:59:00Z"), false, NOW);
    expect(n?.days).toBe(0);
    expect(n?.text).toContain("11:59 p. m.");
  });
  it("cuenta días calendario: vence mañana = 1 día", () => {
    expect(renewalNotice(due("2026-11-11T16:00:00Z"), false, NOW)).toEqual({
      days: 1,
      text: "Tu suscripción vence en 1 día.",
    });
  });
  it("avisa desde 5 días antes, no antes", () => {
    expect(renewalNotice(due("2026-11-15T16:00:00Z"), false, NOW)?.days).toBe(5);
    expect(renewalNotice(due("2026-11-16T16:00:00Z"), false, NOW)).toBeNull();
  });
  it("no avisa si ya venció, si está exonerada o sin fecha", () => {
    expect(renewalNotice(due("2026-11-09T16:00:00Z"), false, NOW)).toBeNull();
    expect(renewalNotice(due("2026-11-11T16:00:00Z"), true, NOW)).toBeNull();
    expect(renewalNotice(null, false, NOW)).toBeNull();
  });
});
