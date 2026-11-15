import { backfillQuestionTaxonomy } from "../src/lib/question-taxonomy";

async function main() {
  const result = await backfillQuestionTaxonomy();
  console.log(
    `question taxonomy: ${result.banks} banks checked, ${result.banksUpdated} banks updated, ${result.questionsUpdated} question groups updated`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});