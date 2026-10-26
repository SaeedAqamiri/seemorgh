import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { ensureSchema } from "./init";
import * as schema from "./schema";

type Database = PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __seemorghPg?: PGlite;
  __seemorghDb?: Database;
  __seemorghSchemaReady?: Promise<void>;
};

function instances(): { pg: PGlite; db: Database } {
  if (!globalForDb.__seemorghPg) {
    const dir = process.env.PGLITE_DATA_DIR ?? ".data/pg";
    mkdirSync(dir, { recursive: true });
    globalForDb.__seemorghPg = new PGlite(dir);
  }

  const pg = globalForDb.__seemorghPg;
  if (!globalForDb.__seemorghDb) {
    globalForDb.__seemorghDb = drizzle(pg, { schema });
  }

  return { pg, db: globalForDb.__seemorghDb };
}

export async function getDb(): Promise<Database> {
  const { pg, db } = instances();
  if (!globalForDb.__seemorghSchemaReady) {
    globalForDb.__seemorghSchemaReady = ensureSchema(pg);
  }
  await globalForDb.__seemorghSchemaReady;
  return db;
}

export { schema };
