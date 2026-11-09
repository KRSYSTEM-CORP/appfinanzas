import { describe, expect, it } from "vitest";
import { isHttpsUrl, videoEmbed } from "@/lib/learning";

describe("videos de Learning", () => {
  it("reconoce enlaces de YouTube", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.kind).toBe("youtube");
  });
  it("reconoce enlaces de Vimeo", () => {
    expect(videoEmbed("https://vimeo.com/123456789")?.embedUrl).toBe("https://player.vimeo.com/video/123456789");
  });
  it("no incrusta otros sitios ni enlaces inseguros", () => {
    expect(videoEmbed("https://ejemplo.com/video.mp4")).toBeNull();
    expect(videoEmbed("http://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbed("javascript:alert(1)")).toBeNull();
    expect(videoEmbed("no es un enlace")).toBeNull();
  });
  it("solo acepta enlaces https", () => {
    expect(isHttpsUrl("https://a.com")).toBe(true);
    expect(isHttpsUrl("http://a.com")).toBe(false);
    expect(isHttpsUrl("x")).toBe(false);
  });
});
