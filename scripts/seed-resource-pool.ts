import { getDb } from "../src/db/client";
import { workspaces } from "../src/db/schema";
import { backfillPersonalResourcesFromPool, seedResourcePool } from "../src/lib/resource-pool";

async function main() {
  const db = await getDb();
  const rows = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces);
  for (const workspace of rows) {
    const seeded = await seedResourcePool(workspace.id);
    const backfilled = await backfillPersonalResourcesFromPool(workspace.id);
    console.log(
      `${workspace.name}: ${seeded.books} کتاب جدید، ${seeded.chapters} فصل جدید، ${backfilled} منبع دانش‌آموز فصل‌بندی شد`,
    );
  }
  process.exit(0);
}

main();
