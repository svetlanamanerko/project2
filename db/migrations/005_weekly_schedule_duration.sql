ALTER TABLE schedule_rules
  ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 60;

UPDATE schedule_rules
SET duration_minutes = 60
WHERE duration_minutes IS NULL;

ALTER TABLE schedule_rules
  ALTER COLUMN duration_minutes SET DEFAULT 60,
  ALTER COLUMN duration_minutes SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_rules_duration_minutes_check'
  ) THEN
    ALTER TABLE schedule_rules
      ADD CONSTRAINT schedule_rules_duration_minutes_check
      CHECK (duration_minutes BETWEEN 30 AND 180);
  END IF;
END $$;

WITH duplicates AS (
  SELECT id, row_number() OVER (
    PARTITION BY enrollment_id, iso_weekday, start_time
    ORDER BY id
  ) AS duplicate_number
  FROM schedule_rules
  WHERE active = true
)
UPDATE schedule_rules
SET active = false
WHERE id IN (SELECT id FROM duplicates WHERE duplicate_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS schedule_rules_active_slot_uidx
  ON schedule_rules(enrollment_id, iso_weekday, start_time)
  WHERE active = true;
