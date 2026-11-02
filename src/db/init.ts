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

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS students (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
  weight integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_workspace_title_unique ON subjects(workspace_id, title);

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
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_student_date_unique ON daily_logs(student_id, log_date);

CREATE TABLE IF NOT EXISTS question_banks (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
  created_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_banks_workspace_idx ON question_banks(workspace_id);

CREATE TABLE IF NOT EXISTS questions (
  id text PRIMARY KEY,
  bank_id text NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE SET NULL,
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
  external_key text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_bank_idx ON questions(bank_id);
CREATE INDEX IF NOT EXISTS questions_workspace_idx ON questions(workspace_id);

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
`;

let initPromise: Promise<void> | null = null;

export function ensureSchema(pg: { exec: (sql: string) => Promise<unknown> }): Promise<void> {
  if (!initPromise) {
    initPromise = pg.exec(DDL).then(() => undefined);
  }
  return initPromise;
}
