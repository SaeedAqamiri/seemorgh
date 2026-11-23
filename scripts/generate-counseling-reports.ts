// Generates (and persists) an academic counseling report per student.
// The report combines psych profile, last exam results, resource progress and
// recent adherence, and feeds the auto-plan policy notes.
//
// Usage:
//   bunx tsx scripts/generate-counseling-reports.ts --group "علامه حلی"
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { studentGroups, students, workspaces } from "../src/db/schema";
import { generateCounselingReport, getLatestCounselingReport } from "../src/lib/counseling-report";

const args = process.argv.slice(2);
const groupIndex = args.indexOf("--group");
const GROUP = groupIndex >= 0 ? (args[groupIndex + 1] ?? "").trim() : "";
const FORCE = args.includes("--force");

try {
  for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // no .env — deterministic fallback
}

async function main() {
  const db = await getDb();
  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) throw new Error("no workspace");

  let members = await db
    .select()
    .from(students)
    .where(eq(students.workspaceId, workspace.id));
  if (GROUP) {
    const groups = await db
      .select({ id: studentGroups.id, name: studentGroups.name })
      .from(studentGroups)
      .where(eq(studentGroups.workspaceId, workspace.id));
    const matches = groups.filter((group) => group.name.includes(GROUP));
    if (matches.length === 0) throw new Error(`group not found: ${GROUP}`);
    const ids = new Set(matches.map((group) => group.id));
    members = members.filter((student) => student.groupId && ids.has(student.groupId));
  }

  for (const student of members) {
    const existing = await getLatestCounselingReport(student.id);
    if (existing && !FORCE) {
      console.log(`${student.name}: existing report (${existing.source}) → skip`);
      continue;
    }
    const result = await generateCounselingReport({
      workspaceId: workspace.id,
      studentId: student.id,
      persist: true,
    });
    console.log(
      `${student.name}: ${result.source} — ${result.report.summary.replace(/\s+/g, " ").slice(0, 90)}…`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
