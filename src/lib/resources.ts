import type { ResourceChapter } from "@/db/schema";

const CHAPTER_SPLIT = /[|،,\t]+/;

function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function toNumber(value: string): number | null {
  const normalized = normalizeDigits(value).replace(/[^\d]/g, "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function parseChapters(input: string, totalUnits: number): {
  chapters: ResourceChapter[] | null;
  error: string | null;
} {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { chapters: null, error: null };

  const chapters: ResourceChapter[] = [];
  let cursor = 1;

  for (const [index, line] of lines.entries()) {
    const parts = line.split(CHAPTER_SPLIT).map((part) => part.trim()).filter(Boolean);
    const title = parts[0] ?? "";
    const rawSize = parts[1] ?? "";
    if (!title) return { chapters: null, error: `خط ${index + 1}: عنوان فصل خالی است.` };

    let pages: number | null = null;

    const range = /^(\d+)\s*(?:[-–—]|تا)\s*(\d+)$/.exec(normalizeDigits(rawSize));
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      pages = to - from + 1;
    } else {
      pages = toNumber(rawSize);
    }

    if (pages === null || pages <= 0) {
      return {
        chapters: null,
        error: `خط ${index + 1}: تعداد صفحات فصل «${title}» نامعتبر است. قالب: عنوان | تعداد صفحه`,
      };
    }

    chapters.push({
      title,
      pages,
      startPage: cursor,
      endPage: cursor + pages - 1,
    });
    cursor += pages;
  }

  if (totalUnits > 0 && cursor - 1 > totalUnits) {
    return {
      chapters: null,
      error: `جمع صفحات فصل‌ها (${cursor - 1}) از تعداد کل (${totalUnits}) بیشتر است.`,
    };
  }

  return { chapters, error: null };
}

/**
 * Extended chapter parser used by the resources form.
 * Specialized (test mode): `عنوان | تعداد تست | تعداد تمرین`
 * General (exercise mode): `عنوان | تعداد تمرین`
 * Legacy four-field lines are still accepted, but pages are ignored.
 */
export function parseChapterPlan(
  input: string,
  totalUnits: number,
  mode: "test" | "exercise" = "test",
): {
  chapters: ResourceChapter[] | null;
  error: string | null;
} {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { chapters: null, error: null };

  const chapters: ResourceChapter[] = [];
  let cursor = 1;
  const exerciseMode = mode === "exercise";

  for (const [index, line] of lines.entries()) {
    const parts = line.split(CHAPTER_SPLIT).map((part) => part.trim()).filter(Boolean);
    const title = parts[0] ?? "";
    if (!title) return { chapters: null, error: `خط ${index + 1}: عنوان فصل خالی است.` };

    let testCount = 0;
    let exerciseCount = 0;
    let pages = 0;

    const readCount = (value: string | undefined): number | null => toNumber(value ?? "");
    const range = /^(\d+)\s*(?:[-–—]|تا)\s*(\d+)$/.exec(normalizeDigits(parts[3] ?? ""));

    if (exerciseMode) {
      if (parts.length >= 3) {
        exerciseCount = (readCount(parts[1]) ?? 0) + (readCount(parts[2]) ?? 0);
      } else if (parts.length === 2) {
        exerciseCount = readCount(parts[1]) ?? 0;
      }
    } else if (parts.length >= 4) {
      testCount = readCount(parts[1]) ?? 0;
      exerciseCount = readCount(parts[2]) ?? 0;
      if (range) {
        pages = Number(range[2]) - Number(range[1]) + 1;
      } else {
        pages = readCount(parts[3]) ?? 0;
      }
    } else if (parts.length === 3) {
      testCount = readCount(parts[1]) ?? 0;
      exerciseCount = readCount(parts[2]) ?? 0;
    } else if (parts.length === 2) {
      testCount = readCount(parts[1]) ?? 0;
    }

    if (testCount < 0 || exerciseCount < 0) {
      return {
        chapters: null,
        error: `خط ${index + 1}: تعداد تست/تمرین فصل «${title}» نامعتبر است.`,
      };
    }

    chapters.push({
      title,
      pages,
      startPage: cursor,
      endPage: pages > 0 ? cursor + pages - 1 : cursor - 1,
      testCount,
      exerciseCount,
    });
    cursor += pages;
  }

  if (totalUnits > 0 && cursor - 1 > totalUnits) {
    return {
      chapters: null,
      error: `جمع صفحات فصل‌ها (${cursor - 1}) از تعداد کل (${totalUnits}) بیشتر است.`,
    };
  }

  return { chapters, error: null };
}

export function formatChapterPlan(
  chapters: ResourceChapter[] | null | undefined,
  mode: "test" | "exercise" = "test",
): string {
  if (!chapters?.length) return "";
  return chapters
    .map((chapter) => {
      const tests = chapter.testCount ?? 0;
      const exercises = chapter.exerciseCount ?? 0;
      return mode === "exercise"
        ? `${chapter.title} | ${exercises}`
        : `${chapter.title} | ${tests} | ${exercises}`;
    })
    .join("\n");
}

export function formatChapters(chapters: ResourceChapter[] | null | undefined): string {
  if (!chapters?.length) return "";
  return chapters.map((chapter) => `${chapter.title} | ${chapter.pages}`).join("\n");
}

export function chapterForPage(
  chapters: ResourceChapter[] | null | undefined,
  page: number,
): ResourceChapter | null {
  if (!chapters?.length) return null;
  return (
    chapters.find((chapter) => page >= chapter.startPage && page <= chapter.endPage) ?? null
  );
}

export function chapterLabel(chapter: ResourceChapter): string {
  return `${chapter.title} (صفحه ${chapter.startPage} تا ${chapter.endPage})`;
}
