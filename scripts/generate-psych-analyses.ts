// Backfills AI analyses for psych attempts + overall profile summaries.
// Resumable: attempts that already have analysis_at are skipped.
//
// Usage:
//   bunx tsx scripts/generate-psych-analyses.ts             # all students
//   bunx tsx scripts/generate-psych-analyses.ts --limit 6   # first N students
//   bunx tsx scripts/generate-psych-analyses.ts --concurrency 4
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../src/db/client";
import {
  psychAttempts,
  psychDimensions,
  psychTests,
  students,
  workspaces,
  type PsychBand,
} from "../src/db/schema";
import { findPsychBand } from "../src/lib/psych";
import {
  generatePsychAttemptAnalysis,
  generatePsychProfileSummary,
  levelFromBands,
  markAttemptAnalysis,
  type AnalysisDimensionInput,
  type ProfileAttemptInput,
} from "../src/lib/psych-ai";

const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
const LIMIT = limitIndex >= 0 ? Number(args[limitIndex + 1]) || 0 : 0;
const concIndex = args.indexOf("--concurrency");
const CONCURRENCY = concIndex >= 0 ? Number(args[concIndex + 1]) || 6 : 6;
const REFALLBACK = args.includes("--refallback");

// tsx does not load .env; load it manually so AI_* vars are available.
try {
  for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // no .env — AI runs in deterministic fallback
}

const PSYCH_CATEGORY_LABELS: Record<string, string> = {
  academic: "تحصیلی",
  career: "شغلی و استعداد",
  personal: "شخصیت",
  wellbeing: "سلامت",
  general: "عمومی",
};

async function processStudent(workspaceId: string, studentId: string): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select({ attempt: psychAttempts, test: psychTests })
    .from(psychAttempts)
    .innerJoin(psychTests, eq(psychAttempts.testId, psychTests.id))
    .where(
      and(
        eq(psychAttempts.workspaceId, workspaceId),
        eq(psychAttempts.studentId, studentId),
        eq(psychAttempts.status, "submitted"),
      ),
    )
    .orderBy(desc(psychAttempts.submittedAt), desc(psychAttempts.createdAt));

  if (rows.length === 0) return;

  const latestByTest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByTest.has(row.test.id)) latestByTest.set(row.test.id, row);
  }

  const testIds = [...new Set(rows.map((row) => row.test.id))];
  const dimensionRows = await db
    .select()
    .from(psychDimensions)
    .where(inArray(psychDimensions.testId, testIds))
    .orderBy(asc(psychDimensions.sortOrder));
  const dimsByTest = new Map<string, typeof dimensionRows>();
  for (const dimension of dimensionRows) {
    const list = dimsByTest.get(dimension.testId) ?? [];
    list.push(dimension);
    dimsByTest.set(dimension.testId, list);
  }

  const pending = rows.filter(
    (row) => !row.attempt.analysisAt || (REFALLBACK && row.attempt.analysisSource === "fallback"),
  );
  let done = 0;
  for (const row of pending) {
    const dimensions = dimsByTest.get(row.test.id) ?? [];
    const analysisDimensions: AnalysisDimensionInput[] = dimensions.map((dimension) => {
      const score = row.attempt.scoresJson?.[dimension.id] ?? 0;
      const bands: PsychBand[] = dimension.bandsJson ?? [];
      const band = findPsychBand(bands, score);
      const questionMax = Math.max(
        4,
        ...(bands.map((entry) => entry.min + 4) as number[]),
        (score + 4),
      );
      return {
        title: dimension.title,
        score,
        max: Math.max(questionMax, score),
        bandLabel: band?.label ?? "",
        bandAnalysis: band?.analysis ?? "",
        level: levelFromBands(band, bands),
      };
    });

    const generated = await generatePsychAttemptAnalysis({
      workspaceId,
      studentId,
      attemptId: row.attempt.id,
      testTitle: row.test.title,
      category: PSYCH_CATEGORY_LABELS[row.test.category] ?? row.test.category,
      resultCode: row.attempt.resultCode,
      resultTitle: row.attempt.resultTitle,
      dimensions: analysisDimensions,
    });
    await markAttemptAnalysis({
      attemptId: row.attempt.id,
      analysis: generated.analysis,
      source: generated.source,
    });
    done += 1;
  }

  // Overall profile summary from latest attempt of each test
  const profileAttempts: ProfileAttemptInput[] = [...latestByTest.values()].map((row) => {
    const dimensions = dimsByTest.get(row.test.id) ?? [];
    return {
      testTitle: row.test.title,
      category: row.test.category,
      resultCode: row.attempt.resultCode,
      resultTitle: row.attempt.resultTitle,
      dimensions: dimensions.map((dimension) => {
        const score = row.attempt.scoresJson?.[dimension.id] ?? 0;
        const bands: PsychBand[] = dimension.bandsJson ?? [];
        const band = findPsychBand(bands, score);
        return {
          title: dimension.title,
          level: levelFromBands(band, bands),
          bandLabel: band?.label ?? "",
        };
      }),
    };
  });

  const summary = await generatePsychProfileSummary({
    workspaceId,
    studentId,
    attempts: profileAttempts,
    persistStudentId: studentId,
  });

  console.log(
    `student ${studentId}: analyses=${done}/${pending.length} summary=${summary.source}`,
  );
}

async function main() {
  const db = await getDb();
  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) throw new Error("no workspace");

  const studentRows = await db.select().from(students).where(eq(students.workspaceId, workspace.id));
  const active = studentRows.filter((student) => student.userId);
  const selected = LIMIT > 0 ? active.slice(0, LIMIT) : active;

  const withAttempts = await db
    .selectDistinct({ studentId: psychAttempts.studentId })
    .from(psychAttempts)
    .where(eq(psychAttempts.workspaceId, workspace.id));
  const attemptStudents = new Set(withAttempts.map((row) => row.studentId));
  const queue = selected.filter((student) => attemptStudents.has(student.id));

  console.log(`backfill AI analyses for ${queue.length} students (concurrency=${CONCURRENCY})`);

  let cursor = 0;
  async function worker(id: number): Promise<void> {
    while (cursor < queue.length) {
      const student = queue[cursor];
      cursor += 1;
      try {
        await processStudent(workspace.id, student.id);
      } catch (error) {
        console.error(`student ${student.id} failed:`, error instanceof Error ? error.message : error);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, index) => worker(index)));
  console.log("done");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
