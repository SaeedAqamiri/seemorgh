import { describe, expect, it } from "vitest";
import { resolveEmbed } from "./embed";

describe("content embeds", () => {
  it("embeds Aparat videos", () => {
    expect(resolveEmbed("https://www.aparat.com/v/fiuznb0", "video")).toMatchObject({
      type: "iframe",
      provider: "aparat",
    });
  });

  it("links non-Aparat URLs and rejects unsafe schemes", () => {
    expect(resolveEmbed("https://www.youtube.com/watch?v=abc123", "video")).toMatchObject({
      type: "link",
    });
    expect(resolveEmbed("https://example.com/article", "text")).toMatchObject({
      type: "link",
    });
    expect(resolveEmbed("javascript:alert(1)", "video")).toEqual({ type: "none" });
  });
});
