import { describe, expect, it } from "vitest";
import { recurringExpenses, type ExpenseHistoryItem } from "@/lib/recurring-expenses";

const e = (description: string, spentAt: string, amountCents = 30000, category: string | null = "Alquiler"): ExpenseHistoryItem => ({
  description,
  category,
  amountCents,
  localAmountCents: null,
  enteredInLocal: false,
  spentAt,
});

describe("gastos recurrentes", () => {
  it("detecta un gasto mensual y calcula su próximo vencimiento", () => {
    const r = recurringExpenses([e("Alquiler del local", "2026-09-01"), e("Alquiler del local", "2026-10-01"), e("Alquiler del local", "2026-11-01", 31000)], "2026-11-18");
    expect(r).toHaveLength(1);
    expect(r[0].dueDate).toBe("2026-12-01");
    expect(r[0].daysLeft).toBe(13);
    expect(r[0].amountCents).toBe(31000);
  });
  it("ignora gastos de un solo mes", () => {
    expect(recurringExpenses([e("Reparación", "2026-11-03"), e("Reparación", "2026-11-10")], "2026-11-18")).toHaveLength(0);
  });
  it("marca vencidos con días negativos y respeta fin de mes", () => {
    const r = recurringExpenses([e("Seguro", "2026-09-30", 4000, "Otros"), e("Seguro", "2026-10-31", 4000, "Otros")], "2026-12-03");
    expect(r[0].dueDate).toBe("2026-11-30");
    expect(r[0].daysLeft).toBe(-3);
  });
  it("ordena del más urgente al menos urgente", () => {
    const r = recurringExpenses(
      [e("A", "2026-09-28"), e("A", "2026-10-28"), e("B", "2026-09-22", 100, "Otros"), e("B", "2026-10-22", 100, "Otros")],
      "2026-11-18"
    );
    expect(r.map((x) => x.description)).toEqual(["B", "A"]);
  });
});
