import { asc, eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { psychOptions, psychQuestions, psychTests } from "../src/db/schema";
import {
  PSYCH_SCALE_LABELS,
  PSYCH_TEST_CATALOG,
  scaleForQuestion,
} from "../src/lib/psych-catalog";

async function main() {
  const db = await getDb();
  const catalogByTitle = new Map(PSYCH_TEST_CATALOG.map((test) => [test.title, test]));
  const tests = await db.select().from(psychTests);

  let updated = 0;
  let scanned = 0;
  for (const test of tests) {
    const catalog = catalogByTitle.get(test.title);
    if (!catalog) continue;
    const questions = await db
      .select()
      .from(psychQuestions)
      .where(eq(psychQuestions.testId, test.id))
      .orderBy(asc(psychQuestions.sortOrder));
    const byBody = new Map(catalog.questions.map((question) => [question.body, question]));

    for (const question of questions) {
      const catalogQuestion =
        byBody.get(question.body) ?? catalog.questions[question.sortOrder];
      if (!catalogQuestion) continue;
      const labels = PSYCH_SCALE_LABELS[scaleForQuestion(catalogQuestion.body, catalogQuestion.scale)];
      const options = await db
        .select()
        .from(psychOptions)
        .where(eq(psychOptions.questionId, question.id))
        .orderBy(asc(psychOptions.sortOrder));
      if (options.length !== labels.length) {
        console.warn(`skip ${test.title} / ${question.body} (options ${options.length} != ${labels.length})`);
        continue;
      }
      for (const [index, option] of options.entries()) {
        scanned += 1;
        const next = labels[index];
        if (option.body === next) continue;
        await db.update(psychOptions).set({ body: next }).where(eq(psychOptions.id, option.id));
        updated += 1;
      }
    }
  }

  console.log(`psych options repaired: scanned=${scanned}, updated=${updated}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
