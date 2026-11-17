import { describe, expect, it } from "vitest";
import { directorySearchFilter, paginate } from "@/lib/customer-directory";

describe("directorio de clientes del POS", () => {
  it("sin texto no filtra: salen todos los clientes", () => {
    expect(directorySearchFilter("")).toEqual({});
    expect(directorySearchFilter("   ")).toEqual({});
    expect(directorySearchFilter(undefined)).toEqual({});
  });
  it("con texto busca por nombre, teléfono y cédula, también una sola letra", () => {
    const f = directorySearchFilter("a") as { OR: object[] };
    expect(f.OR).toHaveLength(4);
    expect(JSON.stringify(f)).toContain("phone");
    expect(JSON.stringify(f)).toContain("rif");
  });
  it("«nombre apellido» combina ambas partes", () => {
    const f = directorySearchFilter("Ana Pérez") as { OR: object[] };
    expect(f.OR).toHaveLength(5);
  });
  it("paginate avisa si quedan más", () => {
    expect(paginate([1, 2, 3], 2)).toEqual({ items: [1, 2], hasMore: true });
    expect(paginate([1, 2], 2)).toEqual({ items: [1, 2], hasMore: false });
  });
});
