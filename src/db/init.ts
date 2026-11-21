const DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone);
ALTER TABLE users ADD COLUMN IF NOT EXISTS import_token text;
CREATE UNIQUE INDEX IF NOT EXISTS users_import_token_unique ON users(import_token);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS student_groups (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  field text NOT NULL DEFAULT 'تجربی',
  emoji text NOT NULL DEFAULT '🏫',
  color text NOT NULL DEFAULT '#1f6f4a',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE student_groups ADD COLUMN IF NOT EXISTS field text NOT NULL DEFAULT 'تجربی';
CREATE UNIQUE INDEX IF NOT EXISTS student_groups_workspace_name_unique ON student_groups(workspace_id, name);
CREATE INDEX IF NOT EXISTS student_groups_workspace_idx ON student_groups(workspace_id);

CREATE TABLE IF NOT EXISTS students (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  group_id text REFERENCES student_groups(id) ON DELETE SET NULL,
  counselor_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL,
  grade text NOT NULL DEFAULT 'دوازدهم',
  field text NOT NULL DEFAULT 'تجربی',
  track text NOT NULL DEFAULT 'both',
  guardian_phone text,
  invite_code text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS students_invite_code_unique ON students(invite_code);
CREATE UNIQUE INDEX IF NOT EXISTS students_workspace_phone_unique ON students(workspace_id, phone);
CREATE INDEX IF NOT EXISTS students_workspace_idx ON students(workspace_id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS group_id text;
CREATE INDEX IF NOT EXISTS students_group_idx ON students(group_id);

CREATE TABLE IF NOT EXISTS exam_targets (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title text NOT NULL,
  exam_type text NOT NULL DEFAULT 'konkur',
  exam_date text NOT NULL,
  weight integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_targets_student_idx ON exam_targets(student_id);

CREATE TABLE IF NOT EXISTS subjects (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  grade text,
  field text,
  kind text NOT NULL DEFAULT 'general',
  fields_json jsonb,
  color text NOT NULL DEFAULT '#1f6f4a',
  weight integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_workspace_title_unique ON subjects(workspace_id, title);
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'general';
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS fields_json jsonb;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#1f6f4a';
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS resources (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  unit_type text NOT NULL DEFAULT 'test',
  total_units integer NOT NULL DEFAULT 0,
  completed_units integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resources_student_idx ON resources(student_id);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS chapters_json jsonb;

CREATE TABLE IF NOT EXISTS resource_chapters (
  id text PRIMARY KEY,
  resource_id text NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_index integer NOT NULL DEFAULT 0,
  page_start integer,
  page_end integer,
  pages integer NOT NULL DEFAULT 0,
  completed_pages integer NOT NULL DEFAULT 0,
  test_count integer NOT NULL DEFAULT 0,
  completed_tests integer NOT NULL DEFAULT 0,
  exercise_count integer NOT NULL DEFAULT 0,
  completed_exercises integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resource_chapters_resource_idx ON resource_chapters(resource_id);

CREATE TABLE IF NOT EXISTS resource_pool (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  publisher text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  unit_type text NOT NULL DEFAULT 'test',
  total_units integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 3,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resource_pool_workspace_subject_title_unique ON resource_pool(workspace_id, subject_id, title);
CREATE INDEX IF NOT EXISTS resource_pool_workspace_idx ON resource_pool(workspace_id);

CREATE TABLE IF NOT EXISTS resource_pool_chapters (
  id text PRIMARY KEY,
  pool_id text NOT NULL REFERENCES resource_pool(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_index integer NOT NULL DEFAULT 0,
  page_start integer,
  page_end integer,
  pages integer NOT NULL DEFAULT 0,
  test_count integer NOT NULL DEFAULT 0,
  exercise_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resource_pool_chapters_pool_idx ON resource_pool_chapters(pool_id);

CREATE TABLE IF NOT EXISTS bell_schedules (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  weekday integer NOT NULL DEFAULT 0,
  slot_index integer NOT NULL,
  start_min integer NOT NULL,
  end_min integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bell_schedules ADD COLUMN IF NOT EXISTS weekday integer NOT NULL DEFAULT 0;
-- Drop the legacy (student, slot) unique index BEFORE backfilling, otherwise the
-- per-day copies would violate it.
DROP INDEX IF EXISTS bell_schedules_student_slot_unique;
-- Legacy rows only had (student, slot); copy them to every weekday so each day
-- starts from the same defaults. Idempotent: existing (student, weekday, slot) rows win.
INSERT INTO bell_schedules (id, student_id, weekday, slot_index, start_min, end_min, created_at)
SELECT md5(random()::text || clock_timestamp()::text) || '-bell', src.student_id, wd, src.slot_index, src.start_min, src.end_min, now()
FROM bell_schedules src
CROSS JOIN generate_series(1, 6) AS wd
WHERE src.weekday = 0
  AND NOT EXISTS (
    SELECT 1 FROM bell_schedules x
    WHERE x.student_id = src.student_id AND x.weekday = wd AND x.slot_index = src.slot_index
  );
CREATE UNIQUE INDEX IF NOT EXISTS bell_schedules_student_day_slot_unique ON bell_schedules(student_id, weekday, slot_index);

CREATE TABLE IF NOT EXISTS availability (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  weekday integer NOT NULL,
  start_min integer NOT NULL,
  end_min integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS availability_student_idx ON availability(student_id);

CREATE TABLE IF NOT EXISTS student_constraints (
  student_id text PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  max_daily_minutes integer NOT NULL DEFAULT 240,
  rest_weekday integer NOT NULL DEFAULT 6,
  buffer_pct integer NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS study_goals (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  metric text NOT NULL DEFAULT 'percent',
  current_value real NOT NULL DEFAULT 0,
  target_value real NOT NULL DEFAULT 0,
  weight integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS study_goals_student_subject_unique ON study_goals(student_id, subject_id);

CREATE TABLE IF NOT EXISTS planning_settings (
  student_id text PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  target_date text,
  policy_json jsonb,
  goal_mock_exam_id text,
  replan_from_date text,
  student_level text NOT NULL DEFAULT 'normal',
  analysis_minutes_per_exam integer NOT NULL DEFAULT 120,
  subject_speeds_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE planning_settings ADD COLUMN IF NOT EXISTS goal_mock_exam_id text;
ALTER TABLE planning_settings ADD COLUMN IF NOT EXISTS replan_from_date text;
ALTER TABLE planning_settings ADD COLUMN IF NOT EXISTS student_level text NOT NULL DEFAULT 'normal';
ALTER TABLE planning_settings ADD COLUMN IF NOT EXISTS analysis_minutes_per_exam integer NOT NULL DEFAULT 120;
ALTER TABLE planning_settings ADD COLUMN IF NOT EXISTS subject_speeds_json jsonb;

CREATE TABLE IF NOT EXISTS weekly_panels (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_start text NOT NULL,
  grid_json jsonb,
  daily_routine text NOT NULL DEFAULT '',
  next_week_homework text NOT NULL DEFAULT '',
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_panels_student_week_unique ON weekly_panels(student_id, week_start);

CREATE TABLE IF NOT EXISTS performance_panels (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_start text NOT NULL,
  cells_json jsonb,
  narrative text NOT NULL DEFAULT '',
  narrative_at timestamptz,
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS performance_panels_student_week_unique ON performance_panels(student_id, week_start);

CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_start text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  warnings_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS plans_student_week_unique ON plans(student_id, week_start);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS warnings_json jsonb;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ai_run_id text;
CREATE INDEX IF NOT EXISTS plans_student_idx ON plans(student_id);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  plan_date text NOT NULL,
  planned_start integer NOT NULL,
  planned_end integer NOT NULL,
  subject_id text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  resource_id text REFERENCES resources(id) ON DELETE SET NULL,
  topic text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'study',
  target_units integer NOT NULL DEFAULT 0,
  est_minutes integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  actual_started_at timestamptz,
  actual_ended_at timestamptz,
  actual_units integer NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS chapter_id text REFERENCES resource_chapters(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS resource_text text NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS action_kind text NOT NULL DEFAULT 'study';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS routine_mode text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS mock_exam_id text;
UPDATE tasks SET action_kind = CASE
  WHEN type = 'test' THEN 'test'
  WHEN type = 'review' THEN 'review'
  WHEN type = 'timed_test' THEN 'timedTest'
  WHEN type = 'exercise' THEN 'exercise'
  ELSE 'study'
END
WHERE action_kind = 'study' AND type <> 'study';
CREATE INDEX IF NOT EXISTS tasks_plan_idx ON tasks(plan_id);
CREATE INDEX IF NOT EXISTS tasks_date_idx ON tasks(plan_date);

CREATE TABLE IF NOT EXISTS daily_logs (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  log_date text NOT NULL,
  mood integer,
  energy integer,
  note text NOT NULL DEFAULT '',
  first_started_at timestamptz,
  first_opened_at timestamptz,
  challenge_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_student_date_unique ON daily_logs(student_id, log_date);
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS first_opened_at timestamptz;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS challenge_completed_at timestamptz;
UPDATE daily_logs SET first_opened_at = first_started_at
WHERE first_opened_at IS NULL AND first_started_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS question_banks (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  created_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id text REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_banks_workspace_idx ON question_banks(workspace_id);
ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS owner_id text REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS question_banks_owner_idx ON question_banks(owner_id);
UPDATE question_banks SET owner_id = created_by WHERE owner_id IS NULL;

CREATE TABLE IF NOT EXISTS questions (
  id text PRIMARY KEY,
  bank_id text NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  grade text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'mcq',
  difficulty text NOT NULL DEFAULT 'medium',
  body text NOT NULL,
  options_json jsonb,
  correct_json jsonb,
  score integer NOT NULL DEFAULT 1,
  explanation text NOT NULL DEFAULT '',
  media_key text,
  tags text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'authored',
  source_title text NOT NULL DEFAULT '',
  source_year text NOT NULL DEFAULT '',
  source_date text NOT NULL DEFAULT '',
  source_ref text NOT NULL DEFAULT '',
  external_key text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_bank_idx ON questions(bank_id);
CREATE INDEX IF NOT EXISTS questions_workspace_idx ON questions(workspace_id);
CREATE INDEX IF NOT EXISTS questions_external_key_idx ON questions(workspace_id, external_key);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS grade text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS questions_subject_idx ON questions(subject_id, grade);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'authored';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_title text NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_year text NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_date text NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_ref text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS exams (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  blueprint_json jsonb,
  manual_question_ids_json jsonb,
  question_snapshot_json jsonb,
  shuffle_questions boolean NOT NULL DEFAULT false,
  shuffle_options boolean NOT NULL DEFAULT false,
  ai_selection boolean NOT NULL DEFAULT false,
  max_attempts integer NOT NULL DEFAULT 1,
  total_score integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exams_workspace_idx ON exams(workspace_id);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS ai_selection boolean NOT NULL DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS manual_question_ids_json jsonb;

CREATE TABLE IF NOT EXISTS exam_assignments (
  id text PRIMARY KEY,
  exam_id text NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_assignments_unique ON exam_assignments(exam_id, student_id);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id text PRIMARY KEY,
  exam_id text NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress',
  score integer NOT NULL DEFAULT 0,
  max_score integer NOT NULL DEFAULT 0,
  time_spent_sec integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_attempts_unique ON exam_attempts(exam_id, student_id, attempt_no);
CREATE INDEX IF NOT EXISTS exam_attempts_student_idx ON exam_attempts(student_id);

CREATE TABLE IF NOT EXISTS exam_answers (
  id text PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  answer_json jsonb,
  is_correct boolean,
  score integer NOT NULL DEFAULT 0,
  feedback text NOT NULL DEFAULT '',
  graded_by text,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_answers_unique ON exam_answers(attempt_id, question_id);

CREATE TABLE IF NOT EXISTS external_exams (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title text NOT NULL,
  exam_date text NOT NULL,
  exam_type text NOT NULL DEFAULT 'external',
  provider text NOT NULL DEFAULT '',
  subjects_json jsonb,
  overall_percent integer NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  mock_exam_id text,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE external_exams ADD COLUMN IF NOT EXISTS mock_exam_id text;
CREATE INDEX IF NOT EXISTS external_exams_student_idx ON external_exams(student_id, exam_date);
CREATE UNIQUE INDEX IF NOT EXISTS external_exams_student_title_date_unique ON external_exams(student_id, title, exam_date);

CREATE TABLE IF NOT EXISTS exam_analyses (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_source text NOT NULL,
  exam_ref_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  exam_date text NOT NULL DEFAULT '',
  step1_json jsonb,
  counselor_note_high text NOT NULL DEFAULT '',
  counselor_note_low text NOT NULL DEFAULT '',
  step2_json jsonb,
  counselor_advice text NOT NULL DEFAULT '',
  advice_approved boolean NOT NULL DEFAULT false,
  step3_json jsonb,
  final_goal text NOT NULL DEFAULT '',
  goals_source text NOT NULL DEFAULT '',
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_analyses_exam_unique ON exam_analyses(student_id, exam_source, exam_ref_id);

CREATE TABLE IF NOT EXISTS school_lessons (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  weekday integer NOT NULL,
  slot_index integer NOT NULL,
  subject_id text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS school_lessons_student_weekday_slot_unique ON school_lessons(student_id, weekday, slot_index);
CREATE INDEX IF NOT EXISTS school_lessons_student_idx ON school_lessons(student_id);

CREATE TABLE IF NOT EXISTS mock_exam_programs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  title text NOT NULL,
  field text NOT NULL,
  grade text NOT NULL DEFAULT 'دوازدهم',
  exam_date text NOT NULL,
  exam_type text NOT NULL DEFAULT 'stage',
  start_min integer NOT NULL DEFAULT 480,
  duration_minutes integer NOT NULL DEFAULT 240,
  analysis_minutes integer NOT NULL DEFAULT 120,
  budget_json jsonb,
  source text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mock_exam_programs_workspace_unique ON mock_exam_programs(workspace_id, provider, title, field, exam_date);
CREATE INDEX IF NOT EXISTS mock_exam_programs_workspace_idx ON mock_exam_programs(workspace_id, exam_date);

CREATE TABLE IF NOT EXISTS student_mock_exams (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mock_exam_id text NOT NULL REFERENCES mock_exam_programs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'selected',
  source text NOT NULL DEFAULT 'manual',
  result_exam_id text REFERENCES external_exams(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS student_mock_exams_unique ON student_mock_exams(student_id, mock_exam_id);
CREATE INDEX IF NOT EXISTS student_mock_exams_student_idx ON student_mock_exams(student_id);

CREATE TABLE IF NOT EXISTS group_mock_exams (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
  mock_exam_id text NOT NULL REFERENCES mock_exam_programs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS group_mock_exams_unique ON group_mock_exams(group_id, mock_exam_id);
CREATE INDEX IF NOT EXISTS group_mock_exams_group_idx ON group_mock_exams(group_id);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload_json jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  diff_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_workspace_idx ON audit_logs(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period_type text NOT NULL,
  period_start text NOT NULL,
  period_end text NOT NULL,
  metrics_json jsonb,
  narrative text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reports_student_period_unique ON reports(student_id, period_type, period_start);

CREATE TABLE IF NOT EXISTS ai_runs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  student_id text REFERENCES students(id) ON DELETE SET NULL,
  kind text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  input_hash text NOT NULL,
  output_json jsonb,
  tokens integer NOT NULL DEFAULT 0,
  cost numeric(10, 4) NOT NULL DEFAULT 0,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_runs_workspace_idx ON ai_runs(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_items (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'video',
  url text,
  body text NOT NULL DEFAULT '',
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  resource_id text REFERENCES resources(id) ON DELETE CASCADE,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_items_workspace_idx ON content_items(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS psych_tests (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  source_url text,
  status text NOT NULL DEFAULT 'draft',
  result_rules_json jsonb,
  created_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS psych_tests_workspace_idx ON psych_tests(workspace_id, created_at DESC);
ALTER TABLE psych_tests ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE psych_tests ADD COLUMN IF NOT EXISTS source_url text;

CREATE TABLE IF NOT EXISTS psych_dimensions (
  id text PRIMARY KEY,
  test_id text NOT NULL REFERENCES psych_tests(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  bands_json jsonb
);
CREATE INDEX IF NOT EXISTS psych_dimensions_test_idx ON psych_dimensions(test_id);
ALTER TABLE psych_dimensions ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE psych_dimensions ADD COLUMN IF NOT EXISTS bands_json jsonb;
ALTER TABLE psych_dimensions DROP COLUMN IF EXISTS key_a;
ALTER TABLE psych_dimensions DROP COLUMN IF EXISTS label_a;
ALTER TABLE psych_dimensions DROP COLUMN IF EXISTS key_b;
ALTER TABLE psych_dimensions DROP COLUMN IF EXISTS label_b;
ALTER TABLE psych_dimensions DROP COLUMN IF EXISTS analysis_a;
ALTER TABLE psych_dimensions DROP COLUMN IF EXISTS analysis_b;

CREATE TABLE IF NOT EXISTS psych_questions (
  id text PRIMARY KEY,
  test_id text NOT NULL REFERENCES psych_tests(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS psych_questions_test_idx ON psych_questions(test_id);

CREATE TABLE IF NOT EXISTS psych_options (
  id text PRIMARY KEY,
  question_id text NOT NULL REFERENCES psych_questions(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  body text NOT NULL,
  scores_json jsonb
);
CREATE INDEX IF NOT EXISTS psych_options_question_idx ON psych_options(question_id);

CREATE TABLE IF NOT EXISTS psych_attempts (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  test_id text NOT NULL REFERENCES psych_tests(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id text REFERENCES students(id) ON DELETE CASCADE,
  participant_role text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL,
  submitted_at timestamptz,
  scores_json jsonb,
  result_code text NOT NULL DEFAULT '',
  result_title text NOT NULL DEFAULT '',
  result_body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS psych_attempts_test_idx ON psych_attempts(test_id, created_at DESC);
CREATE INDEX IF NOT EXISTS psych_attempts_user_idx ON psych_attempts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS psych_answers (
  id text PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES psych_attempts(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  option_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS psych_answers_unique ON psych_answers(attempt_id, question_id);

ALTER TABLE psych_attempts ADD COLUMN IF NOT EXISTS analysis_json jsonb;
ALTER TABLE psych_attempts ADD COLUMN IF NOT EXISTS analysis_source text;
ALTER TABLE psych_attempts ADD COLUMN IF NOT EXISTS analysis_at timestamptz;

CREATE TABLE IF NOT EXISTS psych_profile_summaries (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '',
  data_json jsonb,
  source text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS psych_profile_summaries_student_unique ON psych_profile_summaries(student_id);

CREATE TABLE IF NOT EXISTS counseling_reports (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '',
  report_json jsonb,
  source text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS counseling_reports_student_idx ON counseling_reports(student_id, created_at DESC);
`;

let initPromise: Promise<void> | null = null;

export function ensureSchema(pg: { exec: (sql: string) => Promise<unknown> }): Promise<void> {
  if (!initPromise) {
    initPromise = pg.exec(DDL).then(() => undefined);
  }
  return initPromise;
}
