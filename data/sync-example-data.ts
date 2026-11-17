/**
 * یک‌جا سینک‌کردن کل دادهٔ شبیه‌سازی‌شده در دیتابیس محلی (PGlite).
 *
 *   bun run db:sync            → merge بدون بازنشانی (روی دیتابیس خالی یا هم‌خانواده)
 *   bun run db:sync --reset    → بکاپ + حذف .data/pg و بازسازی کامل
 *
 * مراحل: ساخت اسکیمای تازه → import کامل data/example → بانک سوال تالیفی (۶۸ سوال)
 * → بانک سوال منتا (~۱۵۰ هزار سوال، فقط اگر ‎.monta/import/all-questions.jsonl موجود باشد).
 * سرور باید قبل از اجرا خاموش باشد (PGlite همزمان یک دیتادیر را نمی‌پذیرد).
 */
import { existsSync, cpSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { EXAMPLE_DATE_FIELDS, EXAMPLE_TABLES } from "../src/lib/example-data";
import { questionBanks, questions, students, users, plans, tasks } from "../src/db/schema";
import { seedQuestionBank } from "../scripts/seed-question-bank";
import { importMontaQuestions } from "../src/lib/import-monta";

type Row = Record<string, unknown>;

const DATA_DIR = join(process.cwd(), ".data", "pg");
const EXAMPLE_DIR = join(process.cwd(), "data", "example");
const MONTA_JSONL = join(process.cwd(), ".monta", "import", "all-questions.jsonl");
const BATCH_SIZE = 500;

function devServerLooksAlive(): boolean {
  const pidFile = join(DATA_DIR, "postmaster.pid");
  if (!existsSync(pidFile)) return false;
  const pid = Number.parseInt(readFileSync(pidFile, "utf8").split("\n")[0] ?? "", 10);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function backupAndWipe(): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const backup = `${DATA_DIR}.backup-${stamp}`;
  if (existsSync(DATA_DIR)) {
    cpSync(DATA_DIR, backup, { recursive: true });
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
  return backup;
}

function reviveDates(name: string, rows: Row[]): Row[] {
  const fields = EXAMPLE_DATE_FIELDS[name] ?? [];
  if (fields.length === 0) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const field of fields) {
      const value = copy[field];
      if (typeof value === "string" && value) copy[field] = new Date(value);
    }
    return copy;
  });
}

async function importExample(): Promise<void> {
  readFileSync(join(EXAMPLE_DIR, "manifest.json"), "utf8");
  for (const [name, table] of EXAMPLE_TABLES) {
    const content = readFileSync(join(EXAMPLE_DIR, `${name}.json`), "utf8");
    const rows = reviveDates(name, JSON.parse(content) as Row[]);
    if (rows.length === 0) continue;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await db!
        .insert(table as never)
        .values(rows.slice(i, i + BATCH_SIZE) as never)
        .onConflictDoNothing();
    }
    console.log(`  example/${name}: ${rows.length}`);
  }
}

let db: Awaited<ReturnType<typeof getDb>> | undefined;

async function countAll(table: typeof students | typeof users | typeof plans | typeof tasks | typeof questions | typeof questionBanks): Promise<number> {
  const [row] = await db!.select({ n: sql<number>`count(*)::int` }).from(table);
  return row.n;
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");
  if (!reset && devServerLooksAlive()) {
    console.error("سرور در حال اجراست (postmaster.pid زنده است). اول سرور را خاموش کنید.");
    process.exit(1);
  }
  if (reset) {
    const backup = backupAndWipe();
    console.log(`reset: دیتابیس قبلی به ${backup} بکاپ و پاک شد`);
  }

  db = await getDb();

  const existingStudents = await countAll(students);
  if (existingStudents > 0) {
    console.log(`merge mode: دیتابیس از قبل ${existingStudents} دانش‌آموز دارد (تکراری‌ها skip می‌شوند)`);
  }

  console.log("1/3 import data/example ...");
  try {
    await importExample();
  } catch (error) {
    console.error(
      "import شکست خورد — احتمالاً UUIDهای دیتابیس قبلی با example هم‌خانواده نیستند.",
      "\nبا --reset بازسازی کامل انجام دهید:",
      "\n  bun run db:sync --reset",
    );
    throw error;
  }

  console.log("2/3 seed بانک سوال تالیفی ...");
  const seeded = await seedQuestionBank();
  console.log(`  seed-questions: inserted=${seeded.inserted}, skipped=${seeded.skipped}`);

  console.log("3/3 بانک سوال منتا ...");
  if (existsSync(MONTA_JSONL)) {
    const monta = await importMontaQuestions();
    console.log(`  monta: inserted=${monta.inserted}, skipped=${monta.skipped}, banks=${monta.banks}`);
  } else {
    console.log("  ‎.monta/import/all-questions.jsonl پیدا نشد؛ از این مرحله صرف‌نظر شد.");
    console.log("  (برای انتقال به سیستم دیگر، پوشهٔ ‎.monta یا فایل monta-question-bank.zip را کپی کنید)");
  }

  console.log("\n=== خلاصه ===");
  console.log(`students: ${await countAll(students)}`);
  console.log(`users:    ${await countAll(users)}`);
  console.log(`plans:    ${await countAll(plans)}`);
  console.log(`tasks:    ${await countAll(tasks)}`);
  console.log(`questions: ${await countAll(questions)}`);
  console.log(`banks:     ${await countAll(questionBanks)}`);
  console.log("\nسینک کامل شد. حالا سرور را اجرا کنید: bun run dev");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
