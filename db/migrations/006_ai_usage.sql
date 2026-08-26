CREATE TABLE IF NOT EXISTS ai_usage (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  route text NOT NULL CHECK (route IN ('fast', 'standard', 'analysis')),
  model text NOT NULL,
  purpose text NOT NULL,
  credits_consumed numeric(20, 8),
  student_id text REFERENCES students(id) ON DELETE SET NULL,
  enrollment_id text REFERENCES enrollments(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  error_message text,
  CHECK (credits_consumed IS NULL OR credits_consumed >= 0)
);

CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_route_created_at_idx ON ai_usage(route, created_at DESC);
