import { describe, expect, it } from "vitest";
import { chapterForPage, formatChapters, parseChapters } from "./resources";

describe("resource chapters", () => {
  it("parses chapter pages and computes ranges", () => {
    const result = parseChapters("فصل ۱ | 20\nفصل ۲، ۳۰\nفصل ۳ | ۱ تا ۱۰", 70);
    expect(result.error).toBeNull();
    expect(result.chapters).toEqual([
      { title: "فصل ۱", pages: 20, startPage: 1, endPage: 20 },
      { title: "فصل ۲", pages: 30, startPage: 21, endPage: 50 },
      { title: "فصل ۳", pages: 10, startPage: 51, endPage: 60 },
    ]);
    expect(chapterForPage(result.chapters, 25)?.title).toBe("فصل ۲");
    expect(formatChapters(result.chapters)).toContain("فصل ۲ | 30");
  });

  it("rejects invalid or overflowing chapters", () => {
    expect(parseChapters("فصل ۱ | 50", 40).error).toContain("بیشتر");
    expect(parseChapters("فصل ۱ | سلام", 40).error).toContain("نامعتبر");
    expect(parseChapters("", 40)).toEqual({ chapters: null, error: null });
  });
});
