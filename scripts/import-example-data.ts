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
    if (name === "question_banks") {
      for (const row of rows) {
        if (!row.ownerId && row.createdBy) row.ownerId = row.createdBy;
      }
    }
    if (rows.length === 0) {
      console.log(`${name}: 0`);
      continue;
    }
    await db.insert(table as never).values(rows as never).onConflictDoNothing();
    console.log(`${name}: ${rows.length}`);
  }

  console.log("example data imported from data/example");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
