CREATE TABLE IF NOT EXISTS course_map_items (
  id text PRIMARY KEY,
  course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position integer NOT NULL,
  stage_label text NOT NULL,
  lesson_label text,
  title text NOT NULL,
  intent jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, position)
);

CREATE TABLE IF NOT EXISTS student_course_positions (
  enrollment_id text PRIMARY KEY REFERENCES enrollments(id) ON DELETE CASCADE,
  current_map_item_id text REFERENCES course_map_items(id) ON DELETE SET NULL,
  stage_label text NOT NULL,
  lesson_label text,
  completed_before_tracking boolean NOT NULL DEFAULT false,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_course_stage_statuses (
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  course_map_item_id text NOT NULL REFERENCES course_map_items(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('not_started','in_progress','completed','completed_before_tracking')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (enrollment_id, course_map_item_id)
);

CREATE TABLE IF NOT EXISTS lesson_history (
  id text PRIMARY KEY,
  lesson_id text REFERENCES lessons(id) ON DELETE SET NULL,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  course_map_item_id text REFERENCES course_map_items(id) ON DELETE SET NULL,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  stage_label text NOT NULL,
  lesson_label text,
  skills text[] NOT NULL DEFAULT '{}',
  result_status text NOT NULL CHECK (result_status IN ('completed','repeat','unfinished')),
  teacher_note text,
  homework text,
  next_steps text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lesson_history_materials (
  id text PRIMARY KEY,
  lesson_history_id text NOT NULL REFERENCES lesson_history(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('google_drive','oge_fipi_navigator','ai_generated','other')),
  reference_id text,
  title text NOT NULL,
  url text
);

CREATE TABLE IF NOT EXISTS lesson_history_qids (
  lesson_history_id text NOT NULL REFERENCES lesson_history(id) ON DELETE CASCADE,
  qid text NOT NULL,
  source text NOT NULL DEFAULT 'oge_fipi_navigator',
  PRIMARY KEY (lesson_history_id, qid)
);

CREATE INDEX IF NOT EXISTS course_map_items_course_position_idx ON course_map_items(course_id, position);
CREATE INDEX IF NOT EXISTS lesson_history_enrollment_date_idx ON lesson_history(enrollment_id, occurred_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS lesson_history_qids_qid_idx ON lesson_history_qids(qid);

CREATE UNIQUE INDEX IF NOT EXISTS course_sources_drive_root_idx
  ON course_sources(course_id, drive_file_id)
  WHERE kind='google_drive_root' AND enabled=true AND drive_file_id IS NOT NULL;
