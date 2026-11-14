import { describe, expect, it } from "vitest";
import { dailyChallengeFor, normalizeChallengeAnswer } from "./daily-challenge";

describe("daily challenge", () => {
  it("is stable for the same student and day", () => {
    const first = dailyChallengeFor("student-1", "2026-11-14");
    const second = dailyChallengeFor("student-1", "2026-11-14");
    expect(second).toEqual(first);
    expect(first.question.length).toBeGreaterThan(3);
    expect(Number.isInteger(first.answer)).toBe(true);
  });

  it("changes between days and students", () => {
    const base = dailyChallengeFor("student-1", "2026-11-14");
    const nextDay = dailyChallengeFor("student-1", "2026-11-15");
    const otherStudent = dailyChallengeFor("student-2", "2026-11-14");
    expect([base, nextDay, otherStudent].map((item) => item.key)).toHaveLength(3);
    expect(new Set([base.key, nextDay.key, otherStudent.key]).size).toBe(3);
  });

  it("normalizes Persian and Arabic digits", () => {
    expect(normalizeChallengeAnswer("۶۶")).toBe(66);
    expect(normalizeChallengeAnswer("٦٦")).toBe(66);
    expect(normalizeChallengeAnswer(" 66 ")).toBe(66);
    expect(normalizeChallengeAnswer("")).toBeNull();
  });
});
