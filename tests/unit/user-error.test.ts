import { describe, expect, it } from "vitest";
import { userErrorMessage } from "@/lib/user-error";

describe("userErrorMessage", () => {
  it("deja pasar mensajes de negocio en español", () => {
    expect(userErrorMessage(new Error("No hay stock suficiente de Harina"), "x")).toBe("No hay stock suficiente de Harina");
  });
  it("oculta errores de Prisma", () => {
    expect(userErrorMessage(new Error("Invalid `prisma.sale.create()` invocation: Unique constraint failed"), "Falló")).toBe("Falló");
  });
  it("oculta errores técnicos en inglés", () => {
    expect(userErrorMessage(new Error("Unexpected token"), "Falló")).toBe("Falló");
    expect(userErrorMessage("boom", "Falló")).toBe("Falló");
  });
});
