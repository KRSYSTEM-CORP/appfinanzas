import { describe, expect, it } from "vitest";
import { buildMovementsCsv, buildShiftOptions, csvFileName, parseShiftValue, pickShift } from "@/lib/accounts-segmentation";

describe("selector de turnos", () => {
  const opts = buildShiftOptions(
    [
      { date: "2026-11-22", shiftNumber: 1, responsibleName: "Luis", closed: true },
      { date: "2026-11-23", shiftNumber: 1, responsibleName: null, closed: true },
      { date: "2026-11-23", shiftNumber: 2, responsibleName: "Ana", closed: false },
    ],
    "2026-11-23"
  );
  it("etiqueta y ordena", () => {
    expect(opts.map((o) => o.label)).toEqual(["Hoy · Turno 2 · Ana (abierto)", "Hoy · Turno 1", "Ayer · Turno 1 · Luis"]);
  });
  it("elige el pedido, el abierto o el último", () => {
    expect(pickShift(opts, "2026-11-22:1")?.value).toBe("2026-11-22:1");
    expect(pickShift(opts, "x")?.value).toBe("2026-11-23:2");
    expect(pickShift(opts.filter((o) => !o.open), null)?.value).toBe("2026-11-23:1");
    expect(pickShift([], null)).toBeNull();
  });
  it("parsea el valor", () => {
    expect(parseShiftValue("2026-11-23:2")).toEqual({ date: "2026-11-23", shiftNumber: 2 });
    expect(parseShiftValue("2026-11-23:0")).toBeNull();
  });
});

describe("CSV", () => {
  it("BOM, separador ; y escapes", () => {
    const csv = buildMovementsCsv([
      { at: "2026-11-23T15:00:00Z", account: "Banesco", kind: "COBRO", label: 'Cobro; "x"', amountCents: 12345, currency: "VES" },
      { at: "2026-11-23T16:00:00Z", account: "Banesco", kind: "GASTO", label: "Gasto", amountCents: -500, currency: "VES" },
    ]);
    expect(csv.startsWith("﻿Fecha;Cuenta;Tipo;Descripción;Ingreso;Egreso;Moneda")).toBe(true);
    expect(csv).toContain('"Cobro; ""x"""');
    expect(csv).toContain(";123,45;;VES");
    expect(csv).toContain(";;5,00;VES");
  });
  it("nombre", () => expect(csvFileName("caja", "2026-11-23", "2026-11-23")).toBe("cuentas-caja-2026-11-23-2026-11-23.csv"));
});
