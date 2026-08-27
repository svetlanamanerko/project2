CREATE TABLE IF NOT EXISTS communicative_topic_mastery (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  topic_key text NOT NULL,
  topic_label text NOT NULL,
  answer_stage smallint NOT NULL CHECK (answer_stage BETWEEN 1 AND 5),
  status text NOT NULL CHECK (status IN ('practising','recycle','mastered')),
  evidence text,
  last_practised_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, topic_key)
);

CREATE INDEX IF NOT EXISTS communicative_topic_mastery_enrollment_idx
  ON communicative_topic_mastery(enrollment_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS communicative_topic_mastery_recycle_idx
  ON communicative_topic_mastery(enrollment_id, status, updated_at DESC);
