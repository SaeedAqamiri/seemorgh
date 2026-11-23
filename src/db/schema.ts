import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
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
    importToken: text("import_token"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("users_phone_unique").on(table.phone),
    uniqueIndex("users_import_token_unique").on(table.importToken),
  ],
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

export const studentGroups = pgTable(
  "student_groups",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    field: text("field").notNull().default("تجربی"),
    emoji: text("emoji").notNull().default("🏫"),
    color: text("color").notNull().default("#1f6f4a"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("student_groups_workspace_name_unique").on(table.workspaceId, table.name),
    index("student_groups_workspace_idx").on(table.workspaceId),
  ],
);

export const students = pgTable(
  "students",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => studentGroups.id, { onDelete: "set null" }),
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
    index("students_group_idx").on(table.groupId),
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
    kind: text("kind", { enum: ["general", "specialized", "both"] })
      .notNull()
      .default("general"),
    fieldsJson: jsonb("fields_json").$type<string[]>(),
    color: text("color").notNull().default("#1f6f4a"),
    weight: integer("weight").notNull().default(3),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("subjects_workspace_title_unique").on(table.workspaceId, table.title)],
);

export type ResourceChapter = {
  title: string;
  pages: number;
  startPage: number;
  endPage: number;
  testCount?: number;
  exerciseCount?: number;
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
    unitType: text("unit_type", { enum: ["test", "exercise", "page", "chapter"] })
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

export const resourceChapters = pgTable(
  "resource_chapters",
  {
    id: id(),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortIndex: integer("sort_index").notNull().default(0),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    pages: integer("pages").notNull().default(0),
    completedPages: integer("completed_pages").notNull().default(0),
    testCount: integer("test_count").notNull().default(0),
    completedTests: integer("completed_tests").notNull().default(0),
    exerciseCount: integer("exercise_count").notNull().default(0),
    completedExercises: integer("completed_exercises").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index("resource_chapters_resource_idx").on(table.resourceId)],
);

export const resourcePool = pgTable(
  "resource_pool",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    publisher: text("publisher").notNull().default(""),
    grade: text("grade").notNull().default(""),
    unitType: text("unit_type", { enum: ["test", "exercise", "page", "chapter"] })
      .notNull()
      .default("test"),
    totalUnits: integer("total_units").notNull().default(0),
    priority: integer("priority").notNull().default(3),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("resource_pool_workspace_subject_title_unique").on(
      table.workspaceId,
      table.subjectId,
      table.title,
    ),
    index("resource_pool_workspace_idx").on(table.workspaceId),
  ],
);

export const resourcePoolChapters = pgTable(
  "resource_pool_chapters",
  {
    id: id(),
    poolId: text("pool_id")
      .notNull()
      .references(() => resourcePool.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortIndex: integer("sort_index").notNull().default(0),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    pages: integer("pages").notNull().default(0),
    testCount: integer("test_count").notNull().default(0),
    exerciseCount: integer("exercise_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index("resource_pool_chapters_pool_idx").on(table.poolId)],
);

export const bellSchedules = pgTable(
  "bell_schedules",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull().default(0),
    slotIndex: integer("slot_index").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("bell_schedules_student_day_slot_unique").on(
      table.studentId,
      table.weekday,
      table.slotIndex,
    ),
  ],
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

export type PanelActionKind =
  | "empty"
  | "rest"
  | "study"
  | "review"
  | "test"
  | "timedTest"
  | "exercise"
  | "routine"
  | "school"
  | "exam"
  | "examAnalysis";

type PanelTextAction = {
  kind: "study" | "review";
  subjectId: string;
  resourceText: string;
};

type PanelCountAction = {
  kind: "test" | "timedTest" | "exercise";
  subjectId: string;
  resourceId: string | null;
  chapterId: string | null;
  count: number;
};

type PanelRoutineAction = {
  kind: "routine";
  routineMode: "study" | "test";
  subjectId: string;
  resourceText: string;
  resourceId: string | null;
  chapterId: string | null;
  count: number;
};

type PanelSchoolAction = {
  kind: "school";
  subjectId: string;
  label: string;
};

type PanelEventAction = {
  kind: "exam" | "examAnalysis";
  mockExamId: string | null;
  title: string;
};

export type StudyGoalMetric = "percent" | "score";

export type StudentLevel = "weak" | "normal" | "strong";

export type SubjectSpeedProfile = {
  level?: StudentLevel;
  testsPerHour: number;
  exercisesPerHour: number;
};

export type MockExamBudgetItem = {
  subjectTitle: string;
  chapters: string[];
  pageStart?: number;
  pageEnd?: number;
  weight?: number;
};

export const studyGoals = pgTable(
  "study_goals",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    metric: text("metric", { enum: ["percent", "score"] })
      .notNull()
      .default("percent"),
    currentValue: real("current_value").notNull().default(0),
    targetValue: real("target_value").notNull().default(0),
    weight: integer("weight").notNull().default(3),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("study_goals_student_subject_unique").on(table.studentId, table.subjectId),
  ],
);

export type PlanningPolicyJson = {
  strategy: "balanced" | "weakest_first" | "exam_weighted";
  minutesPerPercentPoint: number;
  minutesPerTest: number;
  testsPerHour: number;
  exercisesPerHour: number;
  testRatioPct: number;
  reviewRatioPct: number;
  maxSubjectsPerDay: number;
  minBlockMinutes: number;
  maxBlockMinutes: number;
  fillCapacity: boolean;
  notes: string;
};

export const planningSettings = pgTable("planning_settings", {
  studentId: text("student_id")
    .primaryKey()
    .references(() => students.id, { onDelete: "cascade" }),
  targetDate: text("target_date"),
  policyJson: jsonb("policy_json").$type<PlanningPolicyJson>(),
  goalMockExamId: text("goal_mock_exam_id"),
  replanFromDate: text("replan_from_date"),
  studentLevel: text("student_level", { enum: ["weak", "normal", "strong"] })
    .notNull()
    .default("normal"),
  analysisMinutesPerExam: integer("analysis_minutes_per_exam").notNull().default(120),
  subjectSpeedsJson: jsonb("subject_speeds_json").$type<Record<string, SubjectSpeedProfile>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
export type PanelCellJson =
  | { kind: "empty" }
  | { kind: "rest" }
  | PanelTextAction
  | PanelCountAction
  | PanelRoutineAction
  | PanelSchoolAction
  | PanelEventAction;

export type WeeklyGridJson = PanelCellJson[][];

export const weeklyPanels = pgTable(
  "weekly_panels",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    weekStart: text("week_start").notNull(),
    gridJson: jsonb("grid_json").$type<WeeklyGridJson>(),
    dailyRoutine: text("daily_routine").notNull().default(""),
    nextWeekHomework: text("next_week_homework").notNull().default(""),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("weekly_panels_student_week_unique").on(table.studentId, table.weekStart),
  ],
);

type PerformanceTimes = { minutes: number; note: string };

export type PerformanceCellJson =
  | { kind: "empty" }
  | { kind: "rest" }
  | ({ kind: "study" | "review"; subjectId: string; resourceText: string } & PerformanceTimes)
  | ({
      kind: "test" | "timedTest" | "exercise";
      subjectId: string;
      resourceId: string | null;
      chapterId: string | null;
      count: number;
    } & PerformanceTimes)
  | ({
      kind: "routine";
      routineMode: "study" | "test";
      subjectId: string;
      resourceText: string;
      resourceId: string | null;
      chapterId: string | null;
      count: number;
    } & PerformanceTimes)
  | ({ kind: "school"; subjectId: string; label: string } & PerformanceTimes)
  | ({
      kind: "exam" | "examAnalysis";
      mockExamId: string | null;
      title: string;
    } & PerformanceTimes);

export type PerformanceGridJson = PerformanceCellJson[][];

export const performancePanels = pgTable(
  "performance_panels",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    weekStart: text("week_start").notNull(),
    cellsJson: jsonb("cells_json").$type<PerformanceGridJson>(),
    narrative: text("narrative").notNull().default(""),
    narrativeAt: timestamp("narrative_at", { withTimezone: true, mode: "date" }),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("performance_panels_student_week_unique").on(table.studentId, table.weekStart),
  ],
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
    chapterId: text("chapter_id").references(() => resourceChapters.id, { onDelete: "set null" }),
    resourceText: text("resource_text").notNull().default(""),
    topic: text("topic").notNull().default(""),
    type: text("type", {
      enum: [
        "study",
        "review",
        "test",
        "timed_test",
        "exercise",
        "school",
        "exam",
        "exam_analysis",
      ],
    })
      .notNull()
      .default("study"),
    actionKind: text("action_kind").notNull().default("study"),
    routineMode: text("routine_mode", { enum: ["study", "test"] }),
    targetUnits: integer("target_units").notNull().default(0),
    estMinutes: integer("est_minutes").notNull(),
    status: text("status", { enum: ["pending", "done", "skipped"] })
      .notNull()
      .default("pending"),
    actualStartedAt: timestamp("actual_started_at", { withTimezone: true, mode: "date" }),
    actualEndedAt: timestamp("actual_ended_at", { withTimezone: true, mode: "date" }),
    actualUnits: integer("actual_units").notNull().default(0),
    note: text("note").notNull().default(""),
    mockExamId: text("mock_exam_id"),
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
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true, mode: "date" }),
    challengeCompletedAt: timestamp("challenge_completed_at", { withTimezone: true, mode: "date" }),
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
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("question_banks_workspace_idx").on(table.workspaceId),
    index("question_banks_owner_idx").on(table.ownerId),
  ],
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
    grade: text("grade").notNull().default(""),
    topic: text("topic").notNull().default(""),
    type: text("type", { enum: ["mcq", "short"] })
      .notNull()
      .default("mcq"),
    difficulty: text("difficulty", {
      enum: ["easy", "medium", "hard", "very_hard"],
    })
      .notNull()
      .default("medium"),
    body: text("body").notNull(),
    optionsJson: jsonb("options_json").$type<string[]>(),
    correctJson: jsonb("correct_json").$type<string | number>(),
    score: integer("score").notNull().default(1),
    explanation: text("explanation").notNull().default(""),
    mediaKey: text("media_key"),
    tags: text("tags").notNull().default(""),
    sourceType: text("source_type", {
      enum: ["konkur", "mock", "authored", "other"],
    })
      .notNull()
      .default("authored"),
    sourceTitle: text("source_title").notNull().default(""),
    sourceYear: text("source_year").notNull().default(""),
    sourceDate: text("source_date").notNull().default(""),
    sourceRef: text("source_ref").notNull().default(""),
    externalKey: text("external_key"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
  },
  (table) => [
    index("questions_bank_idx").on(table.bankId),
    index("questions_workspace_idx").on(table.workspaceId),
    index("questions_subject_idx").on(table.subjectId, table.grade),
    index("questions_external_key_idx").on(table.workspaceId, table.externalKey),
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
    manualQuestionIdsJson: jsonb("manual_question_ids_json").$type<string[]>(),
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

export const questionCollections = pgTable(
  "question_collections",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [
    index("question_collections_workspace_idx").on(table.workspaceId),
    index("question_collections_user_idx").on(table.userId),
  ],
);

export const questionCollectionItems = pgTable(
  "question_collection_items",
  {
    id: id(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => questionCollections.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("question_collection_items_unique").on(
      table.collectionId,
      table.questionId,
    ),
    index("question_collection_items_question_idx").on(table.questionId),
  ],
);


export type ExamSubjectScore = {
  subjectId: string | null;
  subjectTitle: string;
  percent: number;
  correct?: number;
  wrong?: number;
  blank?: number;
  total?: number;
};

export const externalExams = pgTable(
  "external_exams",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    examDate: text("exam_date").notNull(),
    examType: text("exam_type").notNull().default("external"),
    provider: text("provider").notNull().default(""),
    subjectsJson: jsonb("subjects_json").$type<ExamSubjectScore[]>(),
    overallPercent: integer("overall_percent").notNull().default(0),
    note: text("note").notNull().default(""),
    mockExamId: text("mock_exam_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("external_exams_student_idx").on(table.studentId, table.examDate),
    uniqueIndex("external_exams_student_title_date_unique").on(
      table.studentId,
      table.title,
      table.examDate,
    ),
  ],
);

export type ExamAnalysisCauseRow = {
  subjectId: string | null;
  subjectTitle: string;
  percent: number;
  wrong: number;
  blank: number;
  total: number;
  questionNote: string;
  cause: string;
  action: string;
  actionSource: "" | "ai" | "user";
};

export type ExamAnalysisPreparationRow = {
  subjectId: string | null;
  subjectTitle: string;
  topicTests: number;
  timedTests: number;
  avgPercent: number | null;
  approxPercent: number | null;
};

export type ExamAnalysisGoalRow = {
  subjectTitle: string;
  currentPercent: number;
  targetPercent: number | null;
  note: string;
};

export const examAnalyses = pgTable(
  "exam_analyses",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    examSource: text("exam_source").notNull(),
    examRefId: text("exam_ref_id").notNull(),
    title: text("title").notNull().default(""),
    examDate: text("exam_date").notNull().default(""),
    step1Json: jsonb("step1_json").$type<ExamAnalysisCauseRow[]>(),
    counselorNoteHigh: text("counselor_note_high").notNull().default(""),
    counselorNoteLow: text("counselor_note_low").notNull().default(""),
    step2Json: jsonb("step2_json").$type<ExamAnalysisPreparationRow[]>(),
    counselorAdvice: text("counselor_advice").notNull().default(""),
    adviceApproved: boolean("advice_approved").notNull().default(false),
    step3Json: jsonb("step3_json").$type<ExamAnalysisGoalRow[]>(),
    finalGoal: text("final_goal").notNull().default(""),
    goalsSource: text("goals_source").notNull().default(""),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("exam_analyses_exam_unique").on(table.studentId, table.examSource, table.examRefId),
  ],
);

export const schoolLessons = pgTable(
  "school_lessons",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    slotIndex: integer("slot_index").notNull(),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("school_lessons_student_weekday_slot_unique").on(
      table.studentId,
      table.weekday,
      table.slotIndex,
    ),
    index("school_lessons_student_idx").on(table.studentId),
  ],
);

export const mockExamPrograms = pgTable(
  "mock_exam_programs",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    title: text("title").notNull(),
    field: text("field").notNull(),
    grade: text("grade").notNull().default("دوازدهم"),
    examDate: text("exam_date").notNull(),
    examType: text("exam_type", { enum: ["stage", "comprehensive"] })
      .notNull()
      .default("stage"),
    startMin: integer("start_min").notNull().default(480),
    durationMinutes: integer("duration_minutes").notNull().default(240),
    analysisMinutes: integer("analysis_minutes").notNull().default(120),
    budgetJson: jsonb("budget_json").$type<MockExamBudgetItem[]>(),
    source: text("source").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("mock_exam_programs_workspace_unique").on(
      table.workspaceId,
      table.provider,
      table.title,
      table.field,
      table.examDate,
    ),
    index("mock_exam_programs_workspace_idx").on(table.workspaceId, table.examDate),
  ],
);

export const studentMockExams = pgTable(
  "student_mock_exams",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    mockExamId: text("mock_exam_id")
      .notNull()
      .references(() => mockExamPrograms.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["selected", "registered", "taken", "skipped"] })
      .notNull()
      .default("selected"),
    source: text("source", { enum: ["group", "manual"] })
      .notNull()
      .default("manual"),
    resultExamId: text("result_exam_id").references(() => externalExams.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("student_mock_exams_unique").on(table.studentId, table.mockExamId),
    index("student_mock_exams_student_idx").on(table.studentId),
  ],
);

export const groupMockExams = pgTable(
  "group_mock_exams",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => studentGroups.id, { onDelete: "cascade" }),
    mockExamId: text("mock_exam_id")
      .notNull()
      .references(() => mockExamPrograms.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("group_mock_exams_unique").on(table.groupId, table.mockExamId),
    index("group_mock_exams_group_idx").on(table.groupId),
  ],
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

export type PsychDimensionScores = Record<string, number>;

export type PsychBand = {
  min: number;
  max: number | null;
  label: string;
  code: string;
  analysis: string;
};

export type PsychResultRule = {
  code: string;
  title: string;
  body: string;
};

export const psychTests = pgTable(
  "psych_tests",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category", {
      enum: ["academic", "career", "personal", "wellbeing", "general"],
    })
      .notNull()
      .default("general"),
    sourceUrl: text("source_url"),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    resultRulesJson: jsonb("result_rules_json").$type<PsychResultRule[]>(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("psych_tests_workspace_idx").on(table.workspaceId, table.createdAt)],
);

export const psychDimensions = pgTable(
  "psych_dimensions",
  {
    id: id(),
    testId: text("test_id")
      .notNull()
      .references(() => psychTests.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    bandsJson: jsonb("bands_json").$type<PsychBand[]>(),
  },
  (table) => [index("psych_dimensions_test_idx").on(table.testId)],
);

export const psychQuestions = pgTable(
  "psych_questions",
  {
    id: id(),
    testId: text("test_id")
      .notNull()
      .references(() => psychTests.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("psych_questions_test_idx").on(table.testId)],
);

export const psychOptions = pgTable(
  "psych_options",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => psychQuestions.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    body: text("body").notNull(),
    scoresJson: jsonb("scores_json").$type<PsychDimensionScores>(),
  },
  (table) => [index("psych_options_question_idx").on(table.questionId)],
);

export type PsychAiAnalysis = {
  title: string;
  summary: string;
  traits: { title: string; level: string; note: string }[];
  strengths: string[];
  cautions: string[];
  recommendations: string[];
};

export type PsychProfileSummaryData = {
  summary: string;
  personalityTraits: string[];
  academicTraits: string[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};

export type CounselingReportData = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  planningAdvice: string[];
};

export const psychAttempts = pgTable(
  "psych_attempts",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    testId: text("test_id")
      .notNull()
      .references(() => psychTests.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: text("student_id").references(() => students.id, { onDelete: "cascade" }),
    participantRole: text("participant_role", { enum: ["counselor", "student"] }).notNull(),
    status: text("status", { enum: ["in_progress", "submitted"] })
      .notNull()
      .default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" }),
    scoresJson: jsonb("scores_json").$type<PsychDimensionScores>(),
    resultCode: text("result_code").notNull().default(""),
    resultTitle: text("result_title").notNull().default(""),
    resultBody: text("result_body").notNull().default(""),
    analysisJson: jsonb("analysis_json").$type<PsychAiAnalysis>(),
    analysisSource: text("analysis_source"),
    analysisAt: timestamp("analysis_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("psych_attempts_test_idx").on(table.testId, table.createdAt),
    index("psych_attempts_user_idx").on(table.userId, table.createdAt),
  ],
);

export const psychProfileSummaries = pgTable(
  "psych_profile_summaries",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    summary: text("summary").notNull().default(""),
    dataJson: jsonb("data_json").$type<PsychProfileSummaryData>(),
    source: text("source").notNull().default("ai"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("psych_profile_summaries_student_unique").on(table.studentId)],
);

export const counselingReports = pgTable(
  "counseling_reports",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    summary: text("summary").notNull().default(""),
    reportJson: jsonb("report_json").$type<CounselingReportData>(),
    source: text("source").notNull().default("ai"),
    createdAt: createdAt(),
  },
  (table) => [index("counseling_reports_student_idx").on(table.studentId, table.createdAt)],
);

export const psychAnswers = pgTable(
  "psych_answers",
  {
    id: id(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => psychAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    optionId: text("option_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("psych_answers_unique").on(table.attemptId, table.questionId)],
);

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type ResourceChapterRow = typeof resourceChapters.$inferSelect;
export type ResourcePoolBook = typeof resourcePool.$inferSelect;
export type ResourcePoolChapter = typeof resourcePoolChapters.$inferSelect;
export type BellSchedule = typeof bellSchedules.$inferSelect;
export type Availability = typeof availability.$inferSelect;
export type StudentConstraints = typeof studentConstraints.$inferSelect;
export type StudyGoal = typeof studyGoals.$inferSelect;
export type PlanningSettings = typeof planningSettings.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type WeeklyPanel = typeof weeklyPanels.$inferSelect;
export type PerformancePanel = typeof performancePanels.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type QuestionCollection = typeof questionCollections.$inferSelect;
export type QuestionCollectionItem = typeof questionCollectionItems.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type ExternalExam = typeof externalExams.$inferSelect;
export type ExamAnalysis = typeof examAnalyses.$inferSelect;
export type SchoolLesson = typeof schoolLessons.$inferSelect;
export type MockExamProgram = typeof mockExamPrograms.$inferSelect;
export type StudentMockExam = typeof studentMockExams.$inferSelect;
export type GroupMockExam = typeof groupMockExams.$inferSelect;
export type PsychTest = typeof psychTests.$inferSelect;
export type PsychDimension = typeof psychDimensions.$inferSelect;
export type PsychQuestion = typeof psychQuestions.$inferSelect;
export type PsychOption = typeof psychOptions.$inferSelect;
export type PsychAttempt = typeof psychAttempts.$inferSelect;
export type PsychProfileSummary = typeof psychProfileSummaries.$inferSelect;
export type CounselingReport = typeof counselingReports.$inferSelect;
