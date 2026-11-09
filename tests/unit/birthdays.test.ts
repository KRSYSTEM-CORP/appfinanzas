import { describe, expect, it } from "vitest";
import { daysUntilBirthday, upcomingBirthdays } from "@/lib/birthdays";

// La fecha de nacimiento viene de una columna DATE: medianoche UTC.
const born = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("días para el cumpleaños", () => {
  it("hoy es 0, mañana es 1", () => {
    expect(daysUntilBirthday(born("1990-11-09"), "2026-11-09")).toBe(0);
    expect(daysUntilBirthday(born("1990-11-10"), "2026-11-09")).toBe(1);
  });
  it("si ya pasó este año, cuenta hasta el del año siguiente", () => {
    expect(daysUntilBirthday(born("1990-11-08"), "2026-11-09")).toBe(364);
  });
  it("cruza el fin de año", () => {
    expect(daysUntilBirthday(born("1985-01-02"), "2026-12-30")).toBe(3);
  });
  it("el 29 de febrero se celebra el 28 en años no bisiestos y el 29 en bisiestos", () => {
    expect(daysUntilBirthday(born("2000-02-29"), "2027-02-27")).toBe(1); // 2027 no es bisiesto → 28
    expect(daysUntilBirthday(born("2000-02-29"), "2028-02-28")).toBe(1); // 2028 es bisiesto → 29
  });
});

describe("próximos cumpleaños", () => {
  const people = [
    { id: "a", firstName: "Ana", lastName: "Pérez", phone: "1", birthDate: born("1990-11-20") },
    { id: "b", firstName: "Beto", lastName: "Ruiz", phone: "2", birthDate: born("1980-11-09") },
    { id: "c", firstName: "Cora", lastName: "Gil", phone: "3", birthDate: born("1975-03-01") },
    { id: "d", firstName: "Dani", lastName: "Sol", phone: "4", birthDate: null },
  ];
  it("filtra por ventana, ignora a quien no tiene fecha y ordena por cercanía", () => {
    const r = upcomingBirthdays(people, "2026-11-09", 30);
    expect(r.map((x) => [x.id, x.inDays])).toEqual([["b", 0], ["a", 11]]);
  });
});
