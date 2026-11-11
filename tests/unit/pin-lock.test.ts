import { describe, expect, it } from "vitest";
import { computePinKey, pinProblem } from "@/lib/pin";
import { LOCK_AFTER_MS, LOCK_WARNING_MS, lockState, lockTimeoutFor } from "@/lib/lock";

describe("PIN", () => {
  it("acepta 4 números que no sean triviales", () => {
    for (const ok of ["4827", "9301", "2706"]) expect(pinProblem(ok)).toBeNull();
  });
  it("rechaza largo incorrecto o caracteres que no son números", () => {
    for (const bad of ["123", "12345", "123456", "12a4", "", "12 34", "４８２７"]) expect(pinProblem(bad)).not.toBeNull();
  });
  it("rechaza repetidos y secuencias", () => {
    for (const bad of ["0000", "7777", "111111", "1234", "4321", "123456", "6543", "7890", "9012", "3210"]) {
      expect(pinProblem(bad), bad).not.toBeNull();
    }
  });
  it("la huella cambia con la empresa, con el PIN y con el secreto, y es estable", () => {
    const a = computePinKey("s1", "empresa-A", "4827");
    expect(a).toBe(computePinKey("s1", "empresa-A", "4827"));
    expect(a).not.toBe(computePinKey("s1", "empresa-B", "4827"));
    expect(a).not.toBe(computePinKey("s1", "empresa-A", "4828"));
    expect(a).not.toBe(computePinKey("s2", "empresa-A", "4827"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("bloqueo por inactividad", () => {
  const T = lockTimeoutFor("VENDEDOR");
  it("el vendedor se bloquea antes que el gerente", () => {
    expect(LOCK_AFTER_MS.VENDEDOR).toBeLessThan(LOCK_AFTER_MS.GERENTE);
  });
  it("activo, aviso de 15 s y bloqueado", () => {
    expect(lockState(0, 1000, T).phase).toBe("active");
    expect(lockState(0, T - LOCK_WARNING_MS - 1, T).phase).toBe("active");
    const w = lockState(0, T - 10_000, T);
    expect(w).toEqual({ phase: "warning", secondsLeft: 10 });
    expect(lockState(0, T, T).phase).toBe("locked");
  });
  it("si la pestaña estuvo dormida mucho más del límite, queda bloqueado", () => {
    expect(lockState(0, T * 5, T).phase).toBe("locked");
  });
});
