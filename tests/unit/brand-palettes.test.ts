import { describe, expect, it } from "vitest";
import { buildPalettes, tintBackground } from "@/lib/brand-palettes";

describe("tintBackground", () => {
  it("mezcla con blanco", () => {
    expect(tintBackground("#000000", 0.5)).toBe("#808080");
    expect(tintBackground("#433ddd")).toMatch(/^#f[0-9a-f]{5}$/);
  });
  it("color inválido da el fondo por defecto", () => {
    expect(tintBackground("rojo")).toBe("#f9f9f7");
  });
});

describe("buildPalettes", () => {
  it("una paleta por color, con nombre, y descarta los inválidos", () => {
    const p = buildPalettes(["#433DDD", "nope", "#0f9d9a"]);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ name: "Identidad del logo", color: "#433ddd" });
    expect(p[1].name).toBe("Segundo color del logo");
  });
});
