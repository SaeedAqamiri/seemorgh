import { importMontaQuestions } from "../src/lib/import-monta";

async function main() {
  console.log("importing monta questions from .monta/import/all-questions.jsonl ...");
  const result = await importMontaQuestions();
  console.log(
    `monta import done: inserted=${result.inserted}, skipped=${result.skipped}, banks=${result.banks}`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
