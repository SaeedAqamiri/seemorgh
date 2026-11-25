// Applies data/resource-covers.json cover paths to resource_pool + resources.
// The dev server must be stopped (PGlite single-writer).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { resourcePool, resources } from "../src/db/schema";

type MappingBook = {
  coverUrl: string;
  coverSource: string;
  poolIds?: string[];
  resourceIds?: string[];
};

async function main() {
  const mapping = JSON.parse(
    await readFile(path.join(process.cwd(), "data", "resource-covers.json"), "utf8"),
  ) as { books: Record<string, MappingBook> };
  const db = await getDb();
  let poolUpdated = 0;
  let resourcesUpdated = 0;

  for (const book of Object.values(mapping.books)) {
    const poolIds = (book.poolIds ?? []).filter(Boolean);
    if (poolIds.length > 0) {
      const rows = await db
        .update(resourcePool)
        .set({ coverUrl: book.coverUrl, coverSource: book.coverSource })
        .where(
          and(
            inArray(resourcePool.id, poolIds),
            or(
              isNull(resourcePool.coverSource),
              ne(resourcePool.coverSource, "upload"),
            ),
          ),
        )
        .returning({ id: resourcePool.id });
      poolUpdated += rows.length;
    }
    const resourceIds = (book.resourceIds ?? []).filter(Boolean);
    if (resourceIds.length > 0) {
      const rows = await db
        .update(resources)
        .set({ coverUrl: book.coverUrl, coverSource: book.coverSource })
        .where(
          and(
            inArray(resources.id, resourceIds),
            or(isNull(resources.coverSource), ne(resources.coverSource, "upload")),
          ),
        )
        .returning({ id: resources.id });
      resourcesUpdated += rows.length;
    }
  }

  const [poolStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withCover: sql<number>`count(*) filter (where ${resourcePool.coverUrl} is not null)::int`,
    })
    .from(resourcePool);
  const [resourceStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withCover: sql<number>`count(*) filter (where ${resources.coverUrl} is not null)::int`,
    })
    .from(resources);

  console.log(
    `applied covers: poolUpdated=${poolUpdated} resourcesUpdated=${resourcesUpdated}`,
  );
  console.log(
    `pool: ${poolStats.withCover}/${poolStats.total} · resources: ${resourceStats.withCover}/${resourceStats.total}`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
