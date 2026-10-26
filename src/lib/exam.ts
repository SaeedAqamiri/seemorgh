export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType = "mcq" | "short";

export type BlueprintItem = {
  subjectId: string;
  topic: string;
  difficulty: "" | Difficulty;
  count: number;
};

export type ExamBlueprint = {
  items: BlueprintItem[];
};

export type SelectableQuestion = {
  id: string;
  subjectId: string | null;
  subjectTitle: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  body: string;
  options: string[] | null;
  correct: string | number;
  score: number;
  explanation: string;
  externalKey: string | null;
};

export type ExamSnapshotItem = {
  id: string;
  subjectId: string | null;
  subjectTitle: string;
  topic: string;
  type: QuestionType;
  body: string;
  options: string[] | null;
  correct: string | number;
  score: number;
  explanation: string;
};

export type ExamSnapshot = {
  items: ExamSnapshotItem[];
  totalScore: number;
};

export type SnapshotClientItem = Omit<ExamSnapshotItem, "correct" | "explanation">;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seedText: string): T[] {
  const random = mulberry32(hashSeed(seedText));
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function sanitizeBlueprint(raw: unknown): ExamBlueprint {
  if (!raw || typeof raw !== "object") return { items: [] };
  const items = Array.isArray((raw as { items?: unknown }).items)
    ? ((raw as { items: unknown[] }).items ?? [])
    : [];

  return {
    items: items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const count = Math.max(0, Math.floor(Number(record.count ?? 0)));
        const difficulty = String(record.difficulty ?? "");
        return {
          subjectId: String(record.subjectId ?? ""),
          topic: String(record.topic ?? "").trim(),
          difficulty: (["easy", "medium", "hard"].includes(difficulty)
            ? difficulty
            : "") as BlueprintItem["difficulty"],
          count,
        } satisfies BlueprintItem;
      })
      .filter((item): item is BlueprintItem => item !== null && item.subjectId !== "" && item.count > 0),
  };
}

export type SelectionResult = {
  selected: SelectableQuestion[];
  shortages: string[];
  warnings: string[];
};

export function selectExamQuestions(
  blueprint: ExamBlueprint,
  pool: SelectableQuestion[],
  seedText: string,
): SelectionResult {
  const selected: SelectableQuestion[] = [];
  const used = new Set<string>();
  const shortages: string[] = [];
  const warnings: string[] = [];

  for (const [index, item] of blueprint.items.entries()) {
    const candidates = seededShuffle(
      pool.filter(
        (question) =>
          question.subjectId === item.subjectId &&
          (!item.topic || question.topic.trim() === item.topic.trim()) &&
          (!item.difficulty || question.difficulty === item.difficulty) &&
          !used.has(question.id),
      ),
      `${seedText}:${index}:${item.subjectId}:${item.topic}:${item.difficulty}`,
    );

    if (candidates.length < item.count) {
      shortages.push(
        `برای «${candidates[0]?.subjectTitle ?? item.subjectId}${
          item.topic ? ` — ${item.topic}` : ""
        }» فقط ${candidates.length} سوال موجود است (نیاز: ${item.count}).`,
      );
    }

    const chosen = candidates.slice(0, item.count);
    for (const question of chosen) {
      used.add(question.id);
      selected.push(question);
    }
  }

  const duplicateTopics = new Map<string, number>();
  for (const question of selected) {
    duplicateTopics.set(question.topic, (duplicateTopics.get(question.topic) ?? 0) + 1);
  }
  if ([...duplicateTopics.values()].some((count) => count > 12)) {
    warnings.push("توزیع سوالات در یک مبحث نامتوازن است؛ پوشش مباحث را بازبینی کنید.");
  }

  return { selected, shortages, warnings };
}

export function buildSnapshot(selected: SelectableQuestion[]): ExamSnapshot {
  return {
    items: selected.map((question) => ({
      id: question.id,
      subjectId: question.subjectId,
      subjectTitle: question.subjectTitle,
      topic: question.topic,
      type: question.type,
      body: question.body,
      options: question.options,
      correct: question.correct,
      score: question.score,
      explanation: question.explanation,
    })),
    totalScore: selected.reduce((sum, question) => sum + question.score, 0),
  };
}

export function parseSnapshot(raw: unknown): ExamSnapshot {
  if (!raw || typeof raw !== "object") return { items: [], totalScore: 0 };
  const record = raw as { items?: unknown; totalScore?: unknown };
  const items = Array.isArray(record.items) ? (record.items as ExamSnapshotItem[]) : [];
  return {
    items,
    totalScore:
      typeof record.totalScore === "number"
        ? record.totalScore
        : items.reduce((sum, item) => sum + Number(item.score ?? 0), 0),
  };
}

export function clientSnapshot(snapshot: ExamSnapshot): SnapshotClientItem[] {
  return snapshot.items.map((item) => ({
    id: item.id,
    subjectId: item.subjectId,
    subjectTitle: item.subjectTitle,
    topic: item.topic,
    type: item.type,
    body: item.body,
    options: item.options,
    score: item.score,
  }));
}

export function isMcqCorrect(answer: unknown, correct: unknown): boolean {
  if (typeof answer === "number" && typeof correct === "number") return answer === correct;
  return String(answer ?? "").trim() === String(correct ?? "").trim();
}

export function normalizeMcqOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const options = value.map((item) => String(item ?? "").trim()).filter(Boolean);
  return options.length >= 2 ? options : null;
}

export function normalizeCorrect(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isInteger(numeric)) return numeric;
    return trimmed;
  }
  return null;
}

export function shuffleExamSnapshot(
  snapshot: ExamSnapshot,
  seedText: string,
  shuffleQuestions: boolean,
  shuffleOptions: boolean,
): ExamSnapshot {
  let items = snapshot.items;

  if (shuffleQuestions) {
    items = seededShuffle(items, `${seedText}:questions`);
  }

  if (shuffleOptions) {
    items = items.map((item, index) => {
      if (item.type !== "mcq" || !item.options || typeof item.correct !== "number") return item;
      const order = seededShuffle(
        item.options.map((_, optionIndex) => optionIndex + 1),
        `${seedText}:options:${item.id}:${index}`,
      );
      const options = order.map((originalIndex) => item.options![originalIndex - 1]);
      const correct = order.indexOf(item.correct);
      return { ...item, options, correct: correct + 1 };
    });
  }

  return { ...snapshot, items };
}
