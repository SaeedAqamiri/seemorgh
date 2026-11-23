import { describe, expect, it } from "vitest";
import { parseSnapshot, type ExamSnapshot } from "./exam";
import { examTopicsSummary, rankChallengeResults, type ChallengeResultRow } from "./challenges";

function snapshotItem(subjectTitle: string, topic: string): ExamSnapshot["items"][number] {
  return {
    id: `${subjectTitle}-${topic}-${Math.random()}`,
    subjectId: null,
    subjectTitle,
    topic,
    type: "mcq",
    body: "متن سوال",
    options: ["الف", "ب"],
    correct: 1,
    score: 1,
    explanation: "",
  };
}

function resultRow(overrides: Partial<ChallengeResultRow>): ChallengeResultRow {
  return {
    studentId: "s1",
    studentName: "علی",
    role: "invitee",
    inviteStatus: "accepted",
    attemptStatus: "none",
    percent: null,
    score: 0,
    maxScore: 0,
    correct: 0,
    wrong: 0,
    blank: 0,
    timeSpentSec: 0,
    ...overrides,
  };
}

describe("examTopicsSummary", () => {
  it("aggregates by subject and topic, sorted by count", () => {
    const snapshot = parseSnapshot({
      totalScore: 5,
      items: [
        snapshotItem("زیست", "ژنتیک"),
        snapshotItem("زیست", "ژنتیک"),
        snapshotItem("زیست", "ژنتیک"),
        snapshotItem("شیمی", "مول"),
        snapshotItem("شیمی", "مول"),
      ],
    });

    const topics = examTopicsSummary(snapshot);

    expect(topics[0]).toBe("زیست — ژنتیک ×3");
    expect(topics[1]).toBe("شیمی — مول ×2");
  });

  it("caps rows and mentions the rest", () => {
    const snapshot = parseSnapshot({
      totalScore: 3,
      items: [
        snapshotItem("زیست", "الف"),
        snapshotItem("زیست", "ب"),
        snapshotItem("شیمی", "ج"),
      ],
    });

    const topics = examTopicsSummary(snapshot, 2);

    expect(topics).toHaveLength(3);
    expect(topics[2]).toContain("1");
  });

  it("falls back to کلی for blank topics", () => {
    const snapshot = parseSnapshot({
      totalScore: 1,
      items: [snapshotItem("ریاضی", "  ")],
    });

    expect(examTopicsSummary(snapshot)).toEqual(["ریاضی — کلی ×1"]);
  });
});

describe("rankChallengeResults", () => {
  it("ranks finished attempts by percent then faster time, others after", () => {
    const rows = [
      resultRow({ studentId: "s4", studentName: "د", attemptStatus: "none" }),
      resultRow({
        studentId: "s2",
        studentName: "ب",
        attemptStatus: "graded",
        percent: 80,
        timeSpentSec: 900,
        correct: 8,
      }),
      resultRow({
        studentId: "s1",
        studentName: "الف",
        attemptStatus: "graded",
        percent: 90,
        timeSpentSec: 1200,
        correct: 9,
      }),
      resultRow({
        studentId: "s3",
        studentName: "پ",
        attemptStatus: "graded",
        percent: 90,
        timeSpentSec: 800,
        correct: 9,
      }),
      resultRow({ studentId: "s5", studentName: "و", attemptStatus: "in_progress" }),
    ];

    const ranked = rankChallengeResults(rows);

    expect(ranked.map((row) => row.studentId)).toEqual(["s3", "s1", "s2", "s5", "s4"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      resultRow({ studentId: "s1", attemptStatus: "none" }),
      resultRow({
        studentId: "s2",
        attemptStatus: "submitted",
        percent: 50,
        timeSpentSec: 100,
      }),
    ];

    rankChallengeResults(rows);

    expect(rows[0]?.studentId).toBe("s1");
  });
});
