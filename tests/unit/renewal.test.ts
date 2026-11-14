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
    expect(n?.text).toBe("Tu plan vence hoy");
  });
  it("cuenta días calendario: vence mañana = 1 día", () => {
    expect(renewalNotice(due("2026-11-11T16:00:00Z"), false, NOW)).toEqual({
      days: 1,
      text: "Mañana vence tu plan",
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
  it("hay aviso cada día: 5, 4, 3, 2, 1 y el día del vencimiento", () => {
    const texts = [5, 4, 3, 2, 1, 0].map((d) => renewalNotice(new Date(NOW.getTime() + d * 86_400_000), false, NOW)?.text);
    expect(texts).toEqual([
      "Te quedan 5 días para renovar",
      "Te quedan 4 días para renovar",
      "Te quedan 3 días para renovar",
      "Te quedan 2 días para renovar",
      "Mañana vence tu plan",
      "Tu plan vence hoy",
    ]);
  });
});
