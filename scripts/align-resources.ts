import { alignPersonalResourcesWithPool } from "../src/lib/resource-pool";

async function main() {
  const result = await alignPersonalResourcesWithPool();
  console.log(
    `resources aligned with pool: updated=${result.updated}, synthesized=${result.synthesized}, missing=${result.missing}`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
