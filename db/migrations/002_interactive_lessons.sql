ALTER TABLE lesson_packages
  ADD COLUMN IF NOT EXISTS interactive_json jsonb,
  ADD COLUMN IF NOT EXISTS source_excerpt_path text,
  ADD COLUMN IF NOT EXISTS interactive_generated_at timestamptz;

CREATE TABLE IF NOT EXISTS lesson_interactive_progress (
  lesson_id text PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
