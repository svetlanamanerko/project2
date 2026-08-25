CREATE TABLE IF NOT EXISTS student_observations (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrollment_id text REFERENCES enrollments(id) ON DELETE SET NULL,
  lesson_id text REFERENCES lessons(id) ON DELETE SET NULL,
  observed_on date NOT NULL DEFAULT CURRENT_DATE,
  strengths text,
  difficulties text,
  recycle text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_observations_student_date_idx
  ON student_observations(student_id, observed_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS student_recommendations (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  credits numeric(10,3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_recommendations_student_created_idx
  ON student_recommendations(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_plan_items (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','done')),
  source_recommendation_id text REFERENCES student_recommendations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS learning_plan_items_enrollment_status_idx
  ON learning_plan_items(enrollment_id, status, created_at);
