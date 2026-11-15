import { describe, expect, it } from "vitest";
import { chapterForPage, formatChapterPlan, formatChapters, parseChapterPlan, parseChapters } from "./resources";

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

  it("parses test/exercise/page counts per chapter", () => {
    const result = parseChapterPlan("فصل ۱ | 40 | 12 | 24\nفصل ۲ | 35 | 10 | 30", 0);
    expect(result.error).toBeNull();
    expect(result.chapters?.[0]).toMatchObject({
      title: "فصل ۱",
      testCount: 40,
      exerciseCount: 12,
      pages: 24,
      startPage: 1,
      endPage: 24,
    });
    expect(result.chapters?.[1]).toMatchObject({
      title: "فصل ۲",
      testCount: 35,
      pages: 30,
      startPage: 25,
      endPage: 54,
    });
    expect(formatChapterPlan(result.chapters)).toContain("فصل ۱ | 40 | 12");
  });

  it("parses exercise-only chapters for general subjects", () => {
    const result = parseChapterPlan("فصل ۱ | 40\nفصل ۲ | 35", 0, "exercise");
    expect(result.error).toBeNull();
    expect(result.chapters?.[0]).toMatchObject({
      title: "فصل ۱",
      testCount: 0,
      exerciseCount: 40,
      pages: 0,
    });
    expect(result.chapters?.[1]).toMatchObject({
      title: "فصل ۲",
      testCount: 0,
      exerciseCount: 35,
    });
    expect(formatChapterPlan(result.chapters, "exercise")).toContain("فصل ۱ | 40");
    expect(formatChapterPlan(result.chapters, "exercise")).not.toContain("فصل ۱ | 0 | 40");
  });

  it("rejects invalid or overflowing chapters", () => {
    expect(parseChapters("فصل ۱ | 50", 40).error).toContain("بیشتر");
    expect(parseChapters("فصل ۱ | سلام", 40).error).toContain("نامعتبر");
    expect(parseChapters("", 40)).toEqual({ chapters: null, error: null });
  });
});
