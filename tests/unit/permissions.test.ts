import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES, ALL_PERMISSIONS, SECTION_PERMISSION } from "@/lib/permissions";

// hasPermission vive en lib/session (importa servidor); aquí se prueba la misma regla.
function can(
  s: { isSuperAdmin: boolean; role: "GERENTE" | "VENDEDOR"; permissions: string[] | null; allowedSections: string[] },
  p: string
) {
  if (s.isSuperAdmin) return true;
  if (s.permissions) return s.permissions.includes(p);
  if (s.role === "GERENTE") return true;
  const enabled = s.allowedSections.length === 0 ? Object.keys(SECTION_PERMISSION) : s.allowedSections;
  return enabled.some((sec) => SECTION_PERMISSION[sec] === p);
}

describe("roles por defecto", () => {
  it("el Dueño y el Administrador tienen todo; el Gerente todo menos Ajustes", () => {
    expect(DEFAULT_ROLES.find((r) => r.name === "Dueño")!.permissions).toEqual(ALL_PERMISSIONS);
    expect(DEFAULT_ROLES.find((r) => r.name === "Administrador")!.permissions).toEqual(ALL_PERMISSIONS);
    const gerente = DEFAULT_ROLES.find((r) => r.name === "Gerente")!.permissions;
    expect(gerente).not.toContain("settings");
    expect(gerente).toContain("void");
  });
  it("Cajero y Vendedor no anulan ni ven costos", () => {
    for (const n of ["Cajero", "Vendedor"]) {
      const p = DEFAULT_ROLES.find((r) => r.name === n)!.permissions;
      expect(p).not.toContain("void");
      expect(p).not.toContain("costs");
    }
  });
});

describe("regla de permiso", () => {
  const base = { isSuperAdmin: false, allowedSections: [] as string[] };
  it("gerente sin rol lo tiene todo", () => {
    expect(can({ ...base, role: "GERENTE", permissions: null }, "settings")).toBe(true);
  });
  it("vendedor sin rol no anula ni ve costos", () => {
    expect(can({ ...base, role: "VENDEDOR", permissions: null }, "void")).toBe(false);
    expect(can({ ...base, role: "VENDEDOR", permissions: null }, "costs")).toBe(false);
  });
  it("con rol manda el rol", () => {
    expect(can({ ...base, role: "GERENTE", permissions: ["pos"] }, "settings")).toBe(false);
    expect(can({ ...base, role: "VENDEDOR", permissions: ["stats"] }, "stats")).toBe(true);
  });
});
