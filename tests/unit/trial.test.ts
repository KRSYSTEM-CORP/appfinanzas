import { describe, expect, it } from "vitest";
import { FREE_DAYS_PRESETS, addFreeDays, trialDaysLeft } from "@/lib/trial";

const NOW = new Date("2026-11-10T16:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("días gratis", () => {
  it("suma los días a lo que le queda de prueba", () => {
    expect(addFreeDays(day(5), 30, NOW).getTime()).toBe(day(35).getTime());
  });
  it("si la prueba ya venció o no tiene fecha, cuenta desde hoy", () => {
    expect(addFreeDays(day(-3), 30, NOW).getTime()).toBe(day(30).getTime());
    expect(addFreeDays(null, 60, NOW).getTime()).toBe(day(60).getTime());
  });
  it("los atajos son 15 días y 1, 2 y 3 meses de 30 días", () => {
    expect(FREE_DAYS_PRESETS.map((p) => p.days)).toEqual([15, 30, 60, 90]);
  });
  it("días que quedan: redondea hacia arriba y nunca es negativo", () => {
    expect(trialDaysLeft(day(2), NOW)).toBe(2);
    expect(trialDaysLeft(new Date(NOW.getTime() + 3600_000), NOW)).toBe(1);
    expect(trialDaysLeft(day(-4), NOW)).toBe(0);
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });
});
