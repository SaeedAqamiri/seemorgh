import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { aiRuns } from "@/db/schema";
import type { BlueprintItem, SelectableQuestion } from "./exam";

const PROMPT_VERSION = "question-selection-v1";

export function aiSelectionConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL);
}

type CandidateGroup = {
  itemIndex: number;
  item: BlueprintItem;
  candidates: SelectableQuestion[];
};

type AiSelectionRaw = {
  items?: unknown;
  warnings?: unknown;
};

function buildGroups(blueprint: BlueprintItem[], pool: SelectableQuestion[]): CandidateGroup[] {
  return blueprint.map((item, itemIndex) => ({
    itemIndex,
    item,
    candidates: pool.filter(
      (question) =>
        question.subjectId === item.subjectId &&
        (!item.topic || question.topic.trim() === item.topic.trim()) &&
        (!item.difficulty || question.difficulty === item.difficulty),
    ),
  }));
}

export function validateSelection(
  groups: CandidateGroup[],
  raw: unknown,
): { ok: boolean; selected: SelectableQuestion[]; warnings: string[]; errors: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const root = (raw ?? {}) as AiSelectionRaw;
  const outputItems = Array.isArray(root.items) ? root.items : [];
  const used = new Set<string>();
  const selected: SelectableQuestion[] = [];

  if (Array.isArray(root.warnings)) {
    for (const warning of root.warnings.slice(0, 8)) {
      const text = String(warning ?? "").trim();
      if (text) warnings.push(text.slice(0, 300));
    }
  }

  for (const group of groups) {
    const match = outputItems.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      return Number((entry as { item_index?: unknown }).item_index) === group.itemIndex;
    }) as { question_ids?: unknown } | undefined;

    if (!match) {
      errors.push(`ردیف ${group.itemIndex + 1} در خروجی AI نیست.`);
      continue;
    }

    const ids = Array.isArray(match.question_ids)
      ? match.question_ids.map((value) => String(value))
      : [];

    if (ids.length !== group.item.count) {
      errors.push(
        `ردیف ${group.itemIndex + 1}: ${ids.length} سوال انتخاب شد، نیاز ${group.item.count}.`,
      );
      continue;
    }

    for (const id of ids) {
      const question = group.candidates.find((candidate) => candidate.id === id);
      if (!question) {
        errors.push(`سوال ${id} برای ردیف ${group.itemIndex + 1} معتبر نیست.`);
        continue;
      }
      if (used.has(id)) {
        errors.push(`سوال ${id} تکراری است.`);
        continue;
      }
      used.add(id);
      selected.push(question);
    }
  }

  if (selected.length === 0) errors.push("هیچ سوال معتبری انتخاب نشد.");
  return { ok: errors.length === 0, selected, warnings, errors };
}

async function logRun(input: {
  workspaceId: string;
  examId: string;
  status: "success" | "fallback" | "error";
  model: string;
  inputHash: string;
  output: unknown;
  tokens?: number;
  error?: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(aiRuns).values({
    workspaceId: input.workspaceId,
    studentId: null,
    kind: "question_selection",
    model: input.model,
    promptVersion: PROMPT_VERSION,
    inputHash: input.inputHash,
    outputJson: { examId: input.examId, output: input.output },
    tokens: input.tokens ?? 0,
    cost: "0",
    status: input.status,
    error: input.error ?? null,
  });
}

export async function generateAiSelection(input: {
  workspaceId: string;
  examId: string;
  blueprint: BlueprintItem[];
  pool: SelectableQuestion[];
}): Promise<{
  ok: boolean;
  selected: SelectableQuestion[];
  warnings: string[];
  errors: string[];
  source: "ai" | "invalid" | "unconfigured" | "error";
}> {
  const groups = buildGroups(input.blueprint, input.pool);

  for (const group of groups) {
    if (group.candidates.length < group.item.count) {
      return {
        ok: false,
        selected: [],
        warnings: [],
        errors: [`سوال کافی برای ردیف ${group.itemIndex + 1} وجود ندارد.`],
        source: "invalid",
      };
    }
  }

  if (!aiSelectionConfigured()) {
    return {
      ok: false,
      selected: [],
      warnings: [],
      errors: ["AI پیکربندی نشده است."],
      source: "unconfigured",
    };
  }

  const payload = {
    exam_id: input.examId,
    items: groups.map((group) => ({
      item_index: group.itemIndex,
      subject_id: group.item.subjectId,
      topic: group.item.topic,
      difficulty: group.item.difficulty,
      count: group.item.count,
      candidates: group.candidates.map((question) => ({
        id: question.id,
        topic: question.topic,
        difficulty: question.difficulty,
        type: question.type,
        score: question.score,
      })),
    })),
  };

  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const model = process.env.AI_MODEL ?? "deterministic";

  try {
    const baseUrl = process.env.AI_BASE_URL!.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 6000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "تو گزینشگر سوال هستی. فقط JSON برگردان: {items:[{item_index, question_ids:[...]}], warnings:[]}. برای هر ردیف دقیقاً به تعداد count سوال از candidates همان ردیف انتخاب کن. هیچ شناسه‌ای نساز و هیچ سوالی را دو بار استفاده نکن.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "") as unknown;
    const validated = validateSelection(groups, parsed);

    if (!validated.ok) {
      await logRun({
        workspaceId: input.workspaceId,
        examId: input.examId,
        status: "fallback",
        model,
        inputHash,
        output: parsed,
        tokens: data.usage?.total_tokens ?? 0,
        error: validated.errors.slice(0, 6).join(" | "),
      });
      return {
        ok: false,
        selected: [],
        warnings: [],
        errors: validated.errors,
        source: "invalid",
      };
    }

    await logRun({
      workspaceId: input.workspaceId,
      examId: input.examId,
      status: "success",
      model,
      inputHash,
      output: parsed,
      tokens: data.usage?.total_tokens ?? 0,
    });

    return {
      ok: true,
      selected: validated.selected,
      warnings: validated.warnings,
      errors: [],
      source: "ai",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown ai error";
    await logRun({
      workspaceId: input.workspaceId,
      examId: input.examId,
      status: "error",
      model,
      inputHash,
      output: null,
      error: message,
    }).catch(() => undefined);

    return { ok: false, selected: [], warnings: [], errors: [message], source: "error" };
  }
}
