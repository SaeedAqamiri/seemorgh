import { describe, expect, it } from "vitest";
import { buildPoolBooks } from "./resource-pool-data";

describe("resource pool catalog", () => {
  const books = buildPoolBooks();

  it("contains between 100 and 200 catalog books", () => {
    expect(books.length).toBeGreaterThanOrEqual(100);
    expect(books.length).toBeLessThanOrEqual(200);
  });

  it("gives every book a subject, grade, publisher and chapter breakdown", () => {
    for (const book of books) {
      expect(book.subject.length).toBeGreaterThan(0);
      expect(book.grade.length).toBeGreaterThan(0);
      expect(book.publisher.length).toBeGreaterThan(0);
      expect(book.chapters.length).toBeGreaterThan(0);
      expect(book.chapters.every((chapter) => chapter.tests > 0)).toBe(true);
    }
  });

  it("keeps subject + title unique inside the catalog", () => {
    const keys = books.map((book) => `${book.subject}|${book.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
