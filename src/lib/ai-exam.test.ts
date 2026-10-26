import { describe, expect, it } from "vitest";
import { validateSelection } from "./ai-exam";
import type { BlueprintItem, SelectableQuestion } from "./exam";

const pool: SelectableQuestion[] = [
  {
    id: "q1",
    subjectId: "bio",
    subjectTitle: "زیست",
    topic: "ژنتیک",
    difficulty: "easy",
    type: "mcq",
    body: "۱",
    options: ["a", "b"],
    correct: 1,
    score: 1,
    explanation: "",
    externalKey: null,
  },
  {
    id: "q2",
    subjectId: "bio",
    subjectTitle: "زیست",
    topic: "ژنتیک",
    difficulty: "easy",
    type: "mcq",
    body: "۲",
    options: ["a", "b"],
    correct: 1,
    score: 1,
    explanation: "",
    externalKey: null,
  },
];

const blueprint: BlueprintItem[] = [
  { subjectId: "bio", topic: "ژنتیک", difficulty: "easy", count: 2 },
];

const groups = [
  { itemIndex: 0, item: blueprint[0], candidates: pool },
];

describe("AI question selection validation", () => {
  it("accepts exact counts and unique IDs", () => {
    const result = validateSelection(groups, {
      items: [{ item_index: 0, question_ids: ["q1", "q2"] }],
    });
    expect(result.ok).toBe(true);
    expect(result.selected).toHaveLength(2);
  });

  it("rejects wrong counts, duplicates and unknown IDs", () => {
    expect(
      validateSelection(groups, { items: [{ item_index: 0, question_ids: ["q1"] }] }).ok,
    ).toBe(false);
    expect(
      validateSelection(groups, {
        items: [{ item_index: 0, question_ids: ["q1", "q1"] }],
      }).ok,
    ).toBe(false);
    expect(
      validateSelection(groups, {
        items: [{ item_index: 0, question_ids: ["q1", "nope"] }],
      }).ok,
    ).toBe(false);
  });
});
