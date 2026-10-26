import { describe, expect, it } from "vitest";
import { resolveEmbed } from "./embed";

describe("content embeds", () => {
  it("embeds YouTube and Aparat videos", () => {
    expect(resolveEmbed("https://www.youtube.com/watch?v=abc123", "video")).toMatchObject({
      type: "iframe",
      provider: "youtube",
    });
    expect(resolveEmbed("https://youtu.be/abc123", "video")).toMatchObject({
      type: "iframe",
      provider: "youtube",
    });
    expect(resolveEmbed("https://www.aparat.com/v/xyz789", "video")).toMatchObject({
      type: "iframe",
      provider: "aparat",
    });
  });

  it("streams direct video files and links other URLs", () => {
    expect(resolveEmbed("https://cdn.example.com/lesson.mp4", "video")).toMatchObject({
      type: "video",
    });
    expect(resolveEmbed("https://example.com/article", "text")).toMatchObject({
      type: "link",
    });
    expect(resolveEmbed("javascript:alert(1)", "video")).toEqual({ type: "none" });
  });
});
