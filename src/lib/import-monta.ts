import "server-only";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { and, eq, like } from "drizzle-orm";
import { getDb } from "../db/client";
import { questionBanks, questions, subjects, users, workspaces } from "../db/schema";
import {
  inferGradeFromText,
  inferSubjectTitleFromBankTitle,
} from "./question-taxonomy";

type MontaQuestion = {
  bank?: string;
  subject?: string;
  topic?: string;
  type?: string;
  difficulty?: string;
  body?: string;
  options?: unknown;
  correct?: unknown;
  explanation?: string;
  tags?: string;
  media?: unknown;
  external_key?: string;
  source_id?: unknown;
};

function normalize(value: string): string {
  return value
    .replace(/\u200c/g, " ")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectFromBank(bank: string): string | null {
  return inferSubjectTitleFromBankTitle(bank);
}

function subjectFromQuestion(subject: string): string | null {
  return inferSubjectTitleFromBankTitle(subject);
}

function asOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const options = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return options.length >= 2 ? options : null;
}

function asCorrect(value: unknown): number | string {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) return value;
  return 1;
}

export async function importMontaQuestions(): Promise<{
  inserted: number;
  skipped: number;
  banks: number;
}> {
  const db = await getDb();
  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) throw new Error("workspace not found");

  const [counselor] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.workspaceId, workspace.id), eq(users.role, "counselor")))
    .limit(1);
  if (!counselor) throw new Error("counselor not found");

  const subjectRows = await db
    .select({ id: subjects.id, title: subjects.title })
    .from(subjects)
    .where(eq(subjects.workspaceId, workspace.id));
  const subjectIdByTitle = new Map(subjectRows.map((row) => [normalize(row.title), row.id]));

  const existingBanks = await db
    .select({ id: questionBanks.id, title: questionBanks.title })
    .from(questionBanks)
    .where(eq(questionBanks.workspaceId, workspace.id));
  const bankIdByTitle = new Map(existingBanks.map((row) => [row.title, row.id]));

  await db
    .delete(questions)
    .where(
      and(
        eq(questions.workspaceId, workspace.id),
        like(questions.externalKey, "monta:%"),
      ),
    );

  const path = join(process.cwd(), ".monta", "import", "all-questions.jsonl");
  const reader = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  const seen = new Set<string>();
  let inserted = 0;
  let skipped = 0;
  let bankCount = 0;
  let batch: (typeof questions.$inferInsert)[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];
    try {
      await db.insert(questions).values(rows);
      inserted += rows.length;
    } catch (error) {
      console.error("monta batch failed", error);
      skipped += rows.length;
    }
  };

  for await (const line of reader) {
    if (!line.trim()) continue;
    let parsed: MontaQuestion;
    try {
      parsed = JSON.parse(line) as MontaQuestion;
    } catch {
      skipped += 1;
      continue;
    }

    const externalKey = parsed.external_key ?? (parsed.source_id ? `monta:${parsed.source_id}` : null);
    if (!externalKey || seen.has(externalKey)) {
      skipped += 1;
      continue;
    }
    seen.add(externalKey);

    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!body) {
      skipped += 1;
      continue;
    }

    const bankTitle = (parsed.bank || "منتا").trim();
    let bankId = bankIdByTitle.get(bankTitle);
    if (!bankId) {
      const subjectTitle = subjectFromBank(bankTitle) ?? subjectFromQuestion(parsed.subject ?? "");
      const [bank] = await db
        .insert(questionBanks)
        .values({
          workspaceId: workspace.id,
          title: bankTitle,
          subjectId: subjectTitle ? subjectIdByTitle.get(normalize(subjectTitle)) ?? null : null,
          createdBy: counselor.id,
        })
        .returning({ id: questionBanks.id });
      bankId = bank.id;
      bankIdByTitle.set(bankTitle, bankId);
      bankCount += 1;
    }

    const subjectTitle = subjectFromBank(bankTitle) ?? subjectFromQuestion(parsed.subject ?? "");
    const grade = inferGradeFromText(bankTitle, subjectTitle);
    const options = asOptions(parsed.options);
    const media = Array.isArray(parsed.media) && typeof parsed.media[0] === "string" ? parsed.media[0] : null;

    batch.push({
      bankId,
      workspaceId: workspace.id,
      subjectId: subjectTitle ? subjectIdByTitle.get(normalize(subjectTitle)) ?? null : null,
      grade,
      topic: typeof parsed.topic === "string" ? parsed.topic.slice(0, 300) : "",
      type: "mcq",
      difficulty:
        parsed.difficulty === "easy" || parsed.difficulty === "hard" ? parsed.difficulty : "medium",
      body,
      optionsJson: options,
      correctJson: asCorrect(parsed.correct),
      score: 1,
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
      mediaKey: media,
      tags: typeof parsed.tags === "string" ? parsed.tags : "",
      externalKey,
      status: "active",
    });

    if (batch.length >= 200) {
      await flush();
      if (inserted % 10000 === 0) {
        console.log(`monta import: ${inserted.toLocaleString("en-US")} questions`);
      }
    }
  }

  await flush();
  return { inserted, skipped, banks: bankCount };
}
