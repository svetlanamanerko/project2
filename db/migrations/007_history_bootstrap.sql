CREATE TABLE IF NOT EXISTS history_bootstrap_runs (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('draft','confirmed','failed')),
  evidence_fingerprint text NOT NULL,
  analysis jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, evidence_fingerprint)
);

CREATE TABLE IF NOT EXISTS historical_coverage (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed','rejected')),
  stage_label text,
  lesson_label text,
  topic text,
  occurred_on date,
  coverage_summary text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  teacher_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS history_bootstrap_runs_enrollment_idx
  ON history_bootstrap_runs(enrollment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS historical_coverage_enrollment_status_idx
  ON historical_coverage(enrollment_id, status, updated_at DESC);
