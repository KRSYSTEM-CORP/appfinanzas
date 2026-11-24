import { describe, expect, it } from "vitest";
import { activeShiftNumber } from "@/lib/cash-shifts";
import { CASH_CLOSED_MESSAGE, cashGateError, mustCheckShift } from "@/lib/cash-gate";

describe("cash-gate", () => {
  it("bloquea con la caja cerrada y deja pasar si está abierta o se desconoce", () => {
    expect(cashGateError(false)).toBe(CASH_CLOSED_MESSAGE);
    expect(cashGateError(true)).toBeNull();
    expect(cashGateError(null)).toBeNull();
    expect(cashGateError(undefined)).toBeNull();
  });
  it("no exige turno a ventas encoladas ni ya registradas", () => {
    expect(mustCheckShift({ queued: false, alreadyRegistered: false })).toBe(true);
    expect(mustCheckShift({ queued: true, alreadyRegistered: false })).toBe(false);
    expect(mustCheckShift({ queued: false, alreadyRegistered: true })).toBe(false);
  });
  it("se combina con activeShiftNumber", () => {
    expect(cashGateError(activeShiftNumber([], []) != null)).toBe(CASH_CLOSED_MESSAGE);
    expect(cashGateError(activeShiftNumber([{ shiftNumber: 1 }], []) != null)).toBeNull();
    expect(cashGateError(activeShiftNumber([{ shiftNumber: 1 }], [{ shiftNumber: 1, closedAt: new Date() }]) != null)).toBe(CASH_CLOSED_MESSAGE);
  });
});
