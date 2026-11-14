import { describe, expect, it } from "vitest";
import { parseImageUrlCell } from "@/lib/bulk-image";
import { detectImageType, isPrivateAddress } from "@/lib/bulk-image-server";

describe("parseImageUrlCell", () => {
  it("blank cells mean no change", () => {
    expect(parseImageUrlCell("")).toEqual({ kind: "blank" });
    expect(parseImageUrlCell(undefined)).toEqual({ kind: "blank" });
    expect(parseImageUrlCell("   ")).toEqual({ kind: "blank" });
  });
  it("accepts http/https only", () => {
    expect(parseImageUrlCell("https://x.com/a.jpg").kind).toBe("url");
    expect(parseImageUrlCell("javascript:alert(1)").kind).toBe("error");
    expect(parseImageUrlCell("data:image/png;base64,AAAA").kind).toBe("error");
    expect(parseImageUrlCell("ftp://x.com/a.jpg").kind).toBe("error");
    expect(parseImageUrlCell("no es url").kind).toBe("error");
  });
  it("rejects credentials and long urls", () => {
    expect(parseImageUrlCell("https://u:p@x.com/a.jpg").kind).toBe("error");
    expect(parseImageUrlCell("https://x.com/" + "a".repeat(2100)).kind).toBe("error");
  });
});

describe("isPrivateAddress", () => {
  it("flags local ranges", () => {
    for (const a of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(a)).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});

describe("detectImageType", () => {
  it("sniffs magic bytes", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0, 0, 0, 0, 0]))).toBeNull();
  });
});
