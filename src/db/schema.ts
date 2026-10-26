import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow();

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  ownerId: text("owner_id"),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["counselor", "student"] }).notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("users_phone_unique").on(table.phone)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash)],
);

export const students = pgTable(
  "students",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    counselorId: text("counselor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    grade: text("grade").notNull().default("دوازدهم"),
    field: text("field").notNull().default("تجربی"),
    track: text("track", { enum: ["konkur", "final", "both"] })
      .notNull()
      .default("both"),
    guardianPhone: text("guardian_phone"),
    inviteCode: text("invite_code").notNull(),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("students_invite_code_unique").on(table.inviteCode),
    uniqueIndex("students_workspace_phone_unique").on(table.workspaceId, table.phone),
    index("students_workspace_idx").on(table.workspaceId),
  ],
);

export const examTargets = pgTable(
  "exam_targets",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    examType: text("exam_type", { enum: ["final", "konkur", "mock"] })
      .notNull()
      .default("konkur"),
    examDate: text("exam_date").notNull(),
    weight: integer("weight").notNull().default(3),
    createdAt: createdAt(),
  },
  (table) => [index("exam_targets_student_idx").on(table.studentId)],
);

export const subjects = pgTable(
  "subjects",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    grade: text("grade"),
    field: text("field"),
    weight: integer("weight").notNull().default(3),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("subjects_workspace_title_unique").on(table.workspaceId, table.title)],
);

export type ResourceChapter = {
  title: string;
  pages: number;
  startPage: number;
  endPage: number;
};

export const resources = pgTable(
  "resources",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    unitType: text("unit_type", { enum: ["test", "page", "chapter"] })
      .notNull()
      .default("test"),
    totalUnits: integer("total_units").notNull().default(0),
    completedUnits: integer("completed_units").notNull().default(0),
    chaptersJson: jsonb("chapters_json").$type<ResourceChapter[]>(),
    priority: integer("priority").notNull().default(3),
    createdAt: createdAt(),
  },
  (table) => [index("resources_student_idx").on(table.studentId)],
);

export const availability = pgTable(
  "availability",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("availability_student_idx").on(table.studentId)],
);

export const studentConstraints = pgTable(
  "student_constraints",
  {
    studentId: text("student_id")
      .primaryKey()
      .references(() => students.id, { onDelete: "cascade" }),
    maxDailyMinutes: integer("max_daily_minutes").notNull().default(240),
    restWeekday: integer("rest_weekday").notNull().default(6),
    bufferPct: integer("buffer_pct").notNull().default(15),
  },
);

export const plans = pgTable(
  "plans",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    weekStart: text("week_start").notNull(),
    status: text("status", { enum: ["draft", "approved", "active", "archived"] })
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    warningsJson: jsonb("warnings_json").$type<string[]>(),
    aiRunId: text("ai_run_id"),
    createdAt: createdAt(),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("plans_student_week_unique").on(table.studentId, table.weekStart),
    index("plans_student_idx").on(table.studentId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    planDate: text("plan_date").notNull(),
    plannedStart: integer("planned_start").notNull(),
    plannedEnd: integer("planned_end").notNull(),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").references(() => resources.id, { onDelete: "set null" }),
    topic: text("topic").notNull().default(""),
    type: text("type", { enum: ["study", "review", "test"] })
      .notNull()
      .default("study"),
    targetUnits: integer("target_units").notNull().default(0),
    estMinutes: integer("est_minutes").notNull(),
    status: text("status", { enum: ["pending", "done", "skipped"] })
      .notNull()
      .default("pending"),
    actualStartedAt: timestamp("actual_started_at", { withTimezone: true, mode: "date" }),
    actualEndedAt: timestamp("actual_ended_at", { withTimezone: true, mode: "date" }),
    actualUnits: integer("actual_units").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [
    index("tasks_plan_idx").on(table.planId),
    index("tasks_date_idx").on(table.planDate),
  ],
);

export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    logDate: text("log_date").notNull(),
    mood: integer("mood"),
    energy: integer("energy"),
    note: text("note").notNull().default(""),
    firstStartedAt: timestamp("first_started_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("daily_logs_student_date_unique").on(table.studentId, table.logDate)],
);

export const questionBanks = pgTable(
  "question_banks",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subjectId: text("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [index("question_banks_workspace_idx").on(table.workspaceId)],
);

export const questions = pgTable(
  "questions",
  {
    id: id(),
    bankId: text("bank_id")
      .notNull()
      .references(() => questionBanks.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subjectId: text("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    topic: text("topic").notNull().default(""),
    type: text("type", { enum: ["mcq", "short"] })
      .notNull()
      .default("mcq"),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] })
      .notNull()
      .default("medium"),
    body: text("body").notNull(),
    optionsJson: jsonb("options_json").$type<string[]>(),
    correctJson: jsonb("correct_json").$type<string | number>(),
    score: integer("score").notNull().default(1),
    explanation: text("explanation").notNull().default(""),
    mediaKey: text("media_key"),
    tags: text("tags").notNull().default(""),
    externalKey: text("external_key"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
  },
  (table) => [
    index("questions_bank_idx").on(table.bankId),
    index("questions_workspace_idx").on(table.workspaceId),
  ],
);

export const exams = pgTable(
  "exams",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["draft", "scheduled", "open", "closed", "graded"],
    })
      .notNull()
      .default("draft"),
    startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    blueprintJson: jsonb("blueprint_json"),
    questionSnapshotJson: jsonb("question_snapshot_json"),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    shuffleOptions: boolean("shuffle_options").notNull().default(false),
    aiSelection: boolean("ai_selection").notNull().default(false),
    maxAttempts: integer("max_attempts").notNull().default(1),
    totalScore: integer("total_score").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [index("exams_workspace_idx").on(table.workspaceId)],
);

export const examAssignments = pgTable(
  "exam_assignments",
  {
    id: id(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["assigned", "started", "submitted", "absent"] })
      .notNull()
      .default("assigned"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_assignments_unique").on(table.examId, table.studentId)],
);

export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: id(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "date" }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" }),
    status: text("status", { enum: ["in_progress", "submitted", "graded"] })
      .notNull()
      .default("in_progress"),
    score: integer("score").notNull().default(0),
    maxScore: integer("max_score").notNull().default(0),
    timeSpentSec: integer("time_spent_sec").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("exam_attempts_unique").on(table.examId, table.studentId, table.attemptNo),
    index("exam_attempts_student_idx").on(table.studentId),
  ],
);

export const examAnswers = pgTable(
  "exam_answers",
  {
    id: id(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => examAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    answerJson: jsonb("answer_json"),
    isCorrect: boolean("is_correct"),
    score: integer("score").notNull().default(0),
    feedback: text("feedback").notNull().default(""),
    gradedBy: text("graded_by"),
    gradedAt: timestamp("graded_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("exam_answers_unique").on(table.attemptId, table.questionId)],
);


export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [index("notifications_user_idx").on(table.userId, table.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    diffJson: jsonb("diff_json").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [index("audit_logs_workspace_idx").on(table.workspaceId, table.createdAt)],
);


export const reports = pgTable(
  "reports",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    periodType: text("period_type").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    metricsJson: jsonb("metrics_json").$type<Record<string, unknown>>(),
    narrative: text("narrative").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("reports_student_period_unique").on(
      table.studentId,
      table.periodType,
      table.periodStart,
    ),
  ],
);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studentId: text("student_id").references(() => students.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    tokens: integer("tokens").notNull().default(0),
    cost: numeric("cost", { precision: 10, scale: 4 }).notNull().default("0"),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (table) => [index("ai_runs_workspace_idx").on(table.workspaceId, table.createdAt)],
);


export const contentItems = pgTable(
  "content_items",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["video", "text", "psychology"] })
      .notNull()
      .default("video"),
    url: text("url"),
    body: text("body").notNull().default(""),
    subjectId: text("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    resourceId: text("resource_id").references(() => resources.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
  },
  (table) => [index("content_items_workspace_idx").on(table.workspaceId, table.createdAt)],
);

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type Availability = typeof availability.$inferSelect;
export type StudentConstraints = typeof studentConstraints.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Exam = typeof exams.$inferSelect;
