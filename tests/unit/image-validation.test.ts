import { describe, expect, it } from "vitest";
import { isSafeImageDataUrl } from "@/lib/image-validation";

const png = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64");

describe("isSafeImageDataUrl", () => {
  it("acepta un PNG real", () => expect(isSafeImageDataUrl(png, 1000)).toBe(true));
  it("rechaza SVG", () => expect(isSafeImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=", 1000)).toBe(false));
  it("rechaza tipo declarado que no coincide con los bytes", () => {
    const fake = "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64");
    expect(isSafeImageDataUrl(fake, 1000)).toBe(false);
  });
  it("rechaza demasiado grande", () => expect(isSafeImageDataUrl(png, 10)).toBe(false));
});
