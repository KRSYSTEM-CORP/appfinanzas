import { describe, expect, it } from "vitest";
import { classifyBcvRates, formatValueDate } from "@/lib/bcv-next-rate";

const official = { usd: 897.5383, eur: 1001.186, valueDate: "2026-11-09" };
// Viernes 6 nov 2026, 3 p. m. en Venezuela (UTC-4).
const friday = new Date("2026-11-06T19:00:00Z");
// Lunes 9 nov 2026, 10 a. m. en Venezuela.
const monday = new Date("2026-11-09T14:00:00Z");

describe("classifyBcvRates", () => {
  it("detecta una próxima tasa publicada con fecha valor futura", () => {
    const r = classifyBcvRates(official, "USD", 890.1, friday);
    expect(r.next).toEqual({ rate: 897.5383, valueDate: "2026-11-09" });
    expect(r.currentValueDate).toBeNull();
  });
  it("si la activa ya es la publicada, no hay próxima y se conoce su fecha valor", () => {
    const r = classifyBcvRates(official, "USD", 897.5383, friday);
    expect(r.next).toBeNull();
    expect(r.currentValueDate).toBe("2026-11-09");
  });
  it("usa la tasa EUR cuando la referencia es euro", () => {
    expect(classifyBcvRates(official, "EUR", 990, friday).next?.rate).toBe(1001.186);
  });
  it("una fecha valor de hoy no es «próxima»", () => {
    expect(classifyBcvRates(official, "USD", 800, monday).next).toBeNull();
  });
  it("sin tasa activa muestra la publicada como próxima solo si es futura", () => {
    expect(classifyBcvRates(official, "USD", null, friday).next?.valueDate).toBe("2026-11-09");
  });
});

describe("formatValueDate", () => {
  it("da día de la semana, día y mes corto", () => {
    expect(formatValueDate("2026-11-09")).toBe("lunes 9 nov");
  });
  it("devuelve el texto tal cual si no es una fecha", () => {
    expect(formatValueDate("x")).toBe("x");
  });
});
