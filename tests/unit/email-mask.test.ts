import { describe, expect, it, vi } from "vitest";

vi.mock("resend", () => ({ Resend: class {} }));

import { maskEmail } from "@/lib/email";

describe("maskEmail", () => {
  it("oculta el usuario del correo", () => {
    expect(maskEmail("maria@correo.com")).toBe("m***@correo.com");
  });
  it("acepta una lista y valores sin arroba", () => {
    expect(maskEmail(["ana@x.com", "b@y.com"])).toBe("a***@x.com");
    expect(maskEmail("sin-arroba")).toBe("***");
  });
});
