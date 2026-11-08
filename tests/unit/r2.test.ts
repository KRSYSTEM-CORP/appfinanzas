import { describe, expect, it } from "vitest";
import { presign } from "@/lib/r2";

describe("firma de URLs prefirmadas (SigV4)", () => {
  it("coincide con el ejemplo oficial de AWS", () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = presign({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      expiresSec: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toContain("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
    expect(url).toContain("X-Amz-Date=20130524T000000Z");
  });
  it("la firma cambia con el método y con la ruta", () => {
    const base = {
      host: "h.r2.cloudflarestorage.com",
      region: "auto",
      accessKeyId: "k",
      secretAccessKey: "s",
      expiresSec: 60,
      now: new Date("2026-11-09T12:00:00Z"),
    };
    const a = presign({ ...base, method: "GET", path: "/b/learning/a.mp4" });
    const b = presign({ ...base, method: "PUT", path: "/b/learning/a.mp4" });
    const c = presign({ ...base, method: "GET", path: "/b/learning/b.mp4" });
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
