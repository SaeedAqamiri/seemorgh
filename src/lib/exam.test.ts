import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  clientSnapshot,
  parseSnapshot,
  sanitizeBlueprint,
  selectExamQuestions,
  shuffleExamSnapshot,
  type SelectableQuestion,
} from "./exam";

const questions: SelectableQuestion[] = [
  {
    id: "q1",
    subjectId: "bio",
    subjectTitle: "زیست",
    topic: "ژنتیک",
    difficulty: "hard",
    type: "mcq",
    body: "سوال ۱",
    options: ["a", "b", "c", "d"],
    correct: 2,
    score: 2,
    explanation: "توضیح",
    externalKey: null,
  },
  {
    id: "q2",
    subjectId: "bio",
    subjectTitle: "زیست",
    topic: "ژنتیک",
    difficulty: "hard",
    type: "mcq",
    body: "سوال ۲",
    options: ["a", "b", "c", "d"],
    correct: 1,
    score: 1,
    explanation: "",
    externalKey: null,
  },
  {
    id: "q3",
    subjectId: "bio",
    subjectTitle: "زیست",
    topic: "ژنتیک",
    difficulty: "easy",
    type: "mcq",
    body: "سوال ۳",
    options: ["a", "b", "c", "d"],
    correct: 3,
    score: 1,
    explanation: "",
    externalKey: null,
  },
  {
    id: "q4",
    subjectId: "math",
    subjectTitle: "ریاضی",
    topic: "حد",
    difficulty: "medium",
    type: "short",
    body: "سوال ۴",
    options: null,
    correct: "صفر",
    score: 3,
    explanation: "",
    externalKey: null,
  },
];

describe("exam selection", () => {
  it("sanitizes invalid blueprint rows", () => {
    const blueprint = sanitizeBlueprint({
      items: [
        { subjectId: "bio", topic: "ژنتیک", difficulty: "hard", count: 2 },
        { subjectId: "", topic: "x", difficulty: "hard", count: 2 },
        { subjectId: "bio", count: -1 },
        { subjectId: "bio", difficulty: "weird", count: 1 },
      ],
    });
    expect(blueprint.items).toHaveLength(2);
    expect(blueprint.items[1].difficulty).toBe("");
  });

  it("selects deterministically and reports shortages", () => {
    const blueprint = {
      items: [
        { subjectId: "bio", topic: "ژنتیک", difficulty: "hard" as const, count: 1 },
        { subjectId: "math", topic: "", difficulty: "" as const, count: 2 },
      ],
    };
    const first = selectExamQuestions(blueprint, questions, "seed");
    const second = selectExamQuestions(blueprint, questions, "seed");
    expect(first.selected.map((item) => item.id)).toEqual(second.selected.map((item) => item.id));
    expect(first.selected).toHaveLength(2);
    expect(first.shortages).toHaveLength(1);
    expect(first.shortages[0]).toContain("ریاضی");
  });

  it("builds a snapshot and strips answers for the client", () => {
    const snapshot = buildSnapshot(questions.slice(0, 2));
    expect(snapshot.totalScore).toBe(3);
    expect(parseSnapshot(snapshot).items).toHaveLength(2);

    const client = clientSnapshot(snapshot);
    expect(client).toHaveLength(2);
    expect("correct" in client[0]).toBe(false);
    expect("explanation" in client[0]).toBe(false);
  });

  it("shuffles options and remaps the correct answer", () => {
    const snapshot = buildSnapshot([questions[0]]);
    const shuffled = shuffleExamSnapshot(snapshot, "seed", false, true);
    const item = shuffled.items[0];
    expect(item.options).toHaveLength(4);
    expect(item.options?.[Number(item.correct) - 1]).toBe("b");
  });
});
