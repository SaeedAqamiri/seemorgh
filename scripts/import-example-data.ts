import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../src/db/client";
import { EXAMPLE_DATE_FIELDS, EXAMPLE_TABLES } from "../src/lib/example-data";

type Row = Record<string, unknown>;

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

async function main() {
  const db = await getDb();
  const inDir = join(process.cwd(), "data", "example");
  readFileSync(join(inDir, "manifest.json"), "utf8");

  for (const [name, table] of EXAMPLE_TABLES) {
    const content = readFileSync(join(inDir, `${name}.json`), "utf8");
    const rows = reviveDates(name, JSON.parse(content) as Row[]);
    if (rows.length === 0) {
      console.log(`${name}: 0`);
      continue;
    }
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await db.insert(table as never).values(batch as never).onConflictDoNothing();
    }
    console.log(`${name}: ${rows.length}`);
  }

  console.log("example data imported from data/example");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
