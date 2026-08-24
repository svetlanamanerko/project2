CREATE TABLE IF NOT EXISTS students (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  school_grade integer,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id text PRIMARY KEY,
  title text NOT NULL,
  publisher text,
  grade integer,
  drive_folder_id text,
  course_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  started_on date,
  UNIQUE(student_id, course_id)
);

CREATE TABLE IF NOT EXISTS schedule_rules (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  iso_weekday smallint NOT NULL CHECK (iso_weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS school_positions (
  enrollment_id text PRIMARY KEY REFERENCES enrollments(id) ON DELETE CASCADE,
  module text,
  topic text,
  note text,
  next_test_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skill_profiles (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  skill text NOT NULL CHECK (skill IN ('vocabulary','grammar','reading','listening','speaking','writing','pronunciation','exam')),
  level smallint NOT NULL DEFAULT 50 CHECK (level BETWEEN 0 AND 100),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, skill)
);

CREATE TABLE IF NOT EXISTS lessons (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  lesson_type text NOT NULL DEFAULT 'planned' CHECK (lesson_type IN ('planned','catch_up','urgent','consolidation','test_prep','oge')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','prepared','done','cancelled')),
  title text NOT NULL,
  scheduled_date date,
  scheduled_time time,
  source_position text,
  summary text,
  prepared_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lesson_skill_results (
  id text PRIMARY KEY,
  lesson_id text NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  skill text NOT NULL,
  result text NOT NULL CHECK (result IN ('mastered','recycle','difficult')),
  note text
);

CREATE TABLE IF NOT EXISTS recycling_items (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  priority smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','done')),
  source_lesson_id text REFERENCES lessons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS urgent_requests (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  description text NOT NULL,
  detected_topic text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','draft','prepared','done')),
  lesson_id text REFERENCES lessons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upcoming_tasks (
  id text PRIMARY KEY,
  enrollment_id text REFERENCES enrollments(id) ON DELETE CASCADE,
  title text NOT NULL,
  task_type text NOT NULL DEFAULT 'school',
  due_date date,
  notes text,
  done boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS course_sources (
  id text PRIMARY KEY,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  drive_file_id text,
  drive_url text,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS materials (
  id text PRIMARY KEY,
  lesson_id text REFERENCES lessons(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  drive_file_id text,
  drive_url text,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_enrollment_date ON lessons(enrollment_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_recycling_active ON recycling_items(enrollment_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_urgent_status ON urgent_requests(enrollment_id, status);
CREATE INDEX IF NOT EXISTS idx_schedule_weekday ON schedule_rules(iso_weekday, start_time);
