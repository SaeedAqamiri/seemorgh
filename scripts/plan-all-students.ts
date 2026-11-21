import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  availability,
  examTargets,
  plans,
  resources,
  studentConstraints,
  students,
  subjects,
  tasks,
  weeklyPanels,
  type PanelCellJson,
  type WeeklyGridJson,
} from "../src/db/schema";
import { addDays, daysBetween, startOfWeekSaturday, todayISO, weekDates } from "../src/lib/dates";
import { chaptersByResourceIds } from "../src/lib/resource-chapters";
import { getWeekBellSlots, type PanelSlot } from "../src/lib/schedule";

type ResourceState = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  title: string;
  priority: number;
  remainingTests: number;
  chapters: { id: string; title: string; remaining: number }[];
};

type PlannedAction = {
  kind: "study" | "review" | "test" | "timedTest" | "exercise";
  subjectId: string;
  resourceId: string;
  chapterId: string | null;
  resourceText: string;
  count: number;
  topic: string;
};

function actionType(kind: PlannedAction["kind"]) {
  if (kind === "timedTest") return "timed_test" as const;
  if (kind === "exercise") return "exercise" as const;
  if (kind === "review") return "review" as const;
  if (kind === "study") return "study" as const;
  return "test" as const;
}

async function main() {
  const db = await getDb();
  const studentRows = await db
    .select()
    .from(students)
    .where(eq(students.status, "active"));

  const weekStart = startOfWeekSaturday(todayISO());

  for (const student of studentRows) {
    const [targetRows, resourceRows, availabilityRows, constraintRows] = await Promise.all([
      db.select().from(examTargets).where(eq(examTargets.studentId, student.id)),
      db
        .select({
          id: resources.id,
          subjectId: resources.subjectId,
          subjectTitle: subjects.title,
          title: resources.title,
          totalUnits: resources.totalUnits,
          completedUnits: resources.completedUnits,
          priority: resources.priority,
        })
        .from(resources)
        .innerJoin(subjects, eq(resources.subjectId, subjects.id))
        .where(eq(resources.studentId, student.id)),
      db.select().from(availability).where(eq(availability.studentId, student.id)),
      db
        .select()
        .from(studentConstraints)
        .where(eq(studentConstraints.studentId, student.id))
        .limit(1),
    ]);

    if (resourceRows.length === 0) continue;

    const constraints = constraintRows[0] ?? {
      maxDailyMinutes: 720,
      restWeekday: 6,
      bufferPct: 0,
    };
    const examDates = targetRows
      .map((target) => target.examDate)
      .filter((date) => date >= weekStart)
      .sort();
    const lastExam = examDates.at(-1) ?? addDays(weekStart, 7 * 8);
    const examDateSet = new Set(targetRows.map((target) => target.examDate));
    const slots = await getWeekBellSlots(student.id);

    const chapterMap = await chaptersByResourceIds(
      db,
      resourceRows.map((row) => row.id),
    );

    const resourceStates: ResourceState[] = resourceRows
      .map((row) => {
        const chapters = (chapterMap.get(row.id) ?? [])
          .map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            remaining: Math.max(0, chapter.testCount - chapter.completedTests),
          }))
          .filter((chapter) => chapter.remaining > 0);
        const remainingTests =
          chapters.length > 0
            ? chapters.reduce((sum, chapter) => sum + chapter.remaining, 0)
            : Math.max(0, row.totalUnits - row.completedUnits);
        return {
          id: row.id,
          subjectId: row.subjectId,
          subjectTitle: row.subjectTitle,
          title: row.title,
          priority: Math.max(1, Math.min(5, row.priority)),
          remainingTests,
          chapters,
        } satisfies ResourceState;
      });

    const sortedResources = [...resourceStates].sort(
      (a, b) => b.priority - a.priority || a.title.localeCompare(b.title, "fa"),
    );
    let resourceCursor = 0;
    let lastSubjectId: string | null = null;
    let nonTestIndex = 0;
    let testIndex = 0;

    const pickResource = (excludeSubjectId: string | null, requireTests: boolean) => {
      if (sortedResources.length === 0) return null;
      const candidates = sortedResources.filter(
        (resource) => !requireTests || resource.remainingTests > 0,
      );
      if (candidates.length === 0) return null;
      for (let step = 0; step < candidates.length; step += 1) {
        const resource = candidates[(resourceCursor + step) % candidates.length];
        if (excludeSubjectId && resource.subjectId === excludeSubjectId && candidates.length > 1) {
          continue;
        }
        resourceCursor = (resourceCursor + step + 1) % candidates.length;
        return resource;
      }
      return candidates[resourceCursor % candidates.length];
    };

    const takeTest = (resource: ResourceState, amount: number): PlannedAction | null => {
      if (resource.remainingTests <= 0) return null;
      if (resource.chapters.length > 0) {
        const chapter = resource.chapters.find((item) => item.remaining > 0);
        if (!chapter) return null;
        const count = Math.max(1, Math.min(amount, chapter.remaining));
        chapter.remaining -= count;
        resource.remainingTests -= count;
        return {
          kind: testIndex % 4 === 0 ? "timedTest" : "test",
          subjectId: resource.subjectId,
          resourceId: resource.id,
          chapterId: chapter.id,
          resourceText: "",
          count,
          topic: chapter.title,
        };
      }
      const count = Math.max(1, Math.min(amount, resource.remainingTests));
      resource.remainingTests -= count;
      return {
        kind: testIndex % 4 === 0 ? "timedTest" : "test",
        subjectId: resource.subjectId,
        resourceId: resource.id,
        chapterId: null,
        resourceText: "",
        count,
        topic: resource.title,
      };
    };

    const isSlotAvailable = (weekday: number, slot: PanelSlot) =>
      availabilityRows.some(
        (window) =>
          window.weekday === weekday &&
          slot.startMin >= window.startMin &&
          slot.endMin <= window.endMin,
      );

    const weekStarts: string[] = [];
    for (let cursor = weekStart; cursor <= lastExam; cursor = addDays(cursor, 7)) {
      weekStarts.push(cursor);
    }

    await db
      .delete(weeklyPanels)
      .where(
        and(
          eq(weeklyPanels.studentId, student.id),
          inArray(weeklyPanels.weekStart, weekStarts),
        ),
      );
    const existingPlans = await db
      .select({ id: plans.id })
      .from(plans)
      .where(
        and(eq(plans.studentId, student.id), inArray(plans.weekStart, weekStarts)),
      );
    if (existingPlans.length > 0) {
      await db.delete(tasks).where(inArray(tasks.planId, existingPlans.map((plan) => plan.id)));
      await db.delete(plans).where(inArray(plans.id, existingPlans.map((plan) => plan.id)));
    }

    let createdWeeks = 0;
    let createdTasks = 0;

    for (const currentWeek of weekStarts) {
      const dates = weekDates(currentWeek);
      const grid: WeeklyGridJson = dates.map(() =>
        (slots[0] ?? []).map(() => ({ kind: "rest" }) satisfies PanelCellJson),
      );

      const availableCells: { day: number; slot: number; date: string }[] = [];
      for (let day = 0; day < 7; day += 1) {
        const daySlots = slots[day] ?? [];
        if (day === constraints.restWeekday) continue;
        if (examDateSet.has(dates[day])) continue;
        for (let slot = 0; slot < daySlots.length; slot += 1) {
          if (isSlotAvailable(day, daySlots[slot])) {
            availableCells.push({ day, slot, date: dates[day] });
          }
        }
      }

      const weeksLeft = Math.max(1, Math.ceil(daysBetween(currentWeek, lastExam) / 7));
      const remainingTotal = resourceStates.reduce((sum, resource) => sum + resource.remainingTests, 0);
      const nextExam = examDates.find((date) => date >= currentWeek);
      const daysToExam = nextExam ? daysBetween(currentWeek, nextExam) : 999;
      let testBudget =
        remainingTotal === 0
          ? 0
          : Math.ceil(remainingTotal / weeksLeft / 30);
      if (daysToExam <= 7) testBudget = Math.ceil(testBudget * 0.4);
      else if (daysToExam <= 14) testBudget = Math.ceil(testBudget * 0.7);
      testBudget = Math.max(0, Math.min(testBudget, availableCells.length));

      const planned: { date: string; slot: number; day: number; action: PlannedAction }[] = [];
      const totalCells = availableCells.length;

      for (const [cellIndex, cell] of availableCells.entries()) {
        const shouldTest =
          totalCells > 0 &&
          Math.floor(((cellIndex + 1) * testBudget) / totalCells) >
            Math.floor((cellIndex * testBudget) / totalCells);

        if (shouldTest) {
          const resource = pickResource(lastSubjectId, true);
          const action = resource ? takeTest(resource, 30) : null;
          if (action) {
            testIndex += 1;
            lastSubjectId = action.subjectId;
            planned.push({ ...cell, action });
            continue;
          }
        }

        const nonKind =
          nonTestIndex % 7 === 0
            ? "exercise"
            : nonTestIndex % 3 === 0
              ? "study"
              : "review";
        nonTestIndex += 1;
        const resource = pickResource(lastSubjectId, false);
        if (!resource) continue;

        if (nonKind === "exercise") {
          const chapter = resource.chapters[0] ?? null;
          const action: PlannedAction = {
            kind: "exercise",
            subjectId: resource.subjectId,
            resourceId: resource.id,
            chapterId: chapter?.id ?? null,
            resourceText: "",
            count: 15,
            topic: chapter?.title ?? resource.title,
          };
          lastSubjectId = action.subjectId;
          planned.push({ ...cell, action });
        } else {
          const action: PlannedAction = {
            kind: nonKind,
            subjectId: resource.subjectId,
            resourceId: resource.id,
            chapterId: null,
            resourceText: resource.title,
            count: 0,
            topic: resource.title,
          };
          lastSubjectId = action.subjectId;
          planned.push({ ...cell, action });
        }
      }

      for (const item of planned) {
        const action = item.action;
        grid[item.day][item.slot] =
          action.kind === "study" || action.kind === "review"
            ? {
                kind: action.kind,
                subjectId: action.subjectId,
                resourceText: action.resourceText,
              }
            : {
                kind: action.kind,
                subjectId: action.subjectId,
                resourceId: action.resourceId,
                chapterId: action.chapterId,
                count: action.count,
              };
      }

      await db.transaction(async (tx) => {
        const [plan] = await tx
          .insert(plans)
          .values({
            studentId: student.id,
            weekStart: currentWeek,
            status: "approved",
            approvedAt: new Date(),
            warningsJson: [],
          })
          .returning();

        if (planned.length > 0) {
          await tx.insert(tasks).values(
            planned.map(({ date, slot, action }) => {
              const day = dates.indexOf(date);
              const slotDef = slots[day]?.[slot];
              return {
                planId: plan.id,
                planDate: date,
                plannedStart: slotDef?.startMin ?? 8 * 60,
                plannedEnd: slotDef?.endMin ?? 9 * 60 + 30,
                subjectId: action.subjectId,
                resourceId: action.resourceId,
                chapterId: action.chapterId,
                resourceText: action.resourceText,
                topic: action.topic,
                type: actionType(action.kind),
                actionKind: action.kind,
                routineMode: null,
                targetUnits: action.count,
                estMinutes: Math.max(0, (slotDef?.endMin ?? 570) - (slotDef?.startMin ?? 480)),
              };
            }),
          );
        }

        await tx.insert(weeklyPanels).values({
          studentId: student.id,
          weekStart: currentWeek,
          gridJson: grid,
          dailyRoutine: "",
          nextWeekHomework: "",
          updatedAt: new Date(),
        });
      });

      createdWeeks += 1;
      createdTasks += planned.length;
    }

    console.log(
      `${student.name} (${student.field}/${student.grade}): ${createdWeeks} هفته، ${createdTasks} اقدام`,
    );
  }

  process.exit(0);
}

main();
