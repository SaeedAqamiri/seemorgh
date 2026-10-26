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
