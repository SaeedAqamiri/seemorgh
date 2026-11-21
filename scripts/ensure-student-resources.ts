import { ensureStudentSubjectResources } from "../src/lib/resource-pool";

async function main() {
  const result = await ensureStudentSubjectResources();
  console.log(
    `student resources aligned: students=${result.students}, added=${result.added}, synthesized=${result.synthesized}`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
