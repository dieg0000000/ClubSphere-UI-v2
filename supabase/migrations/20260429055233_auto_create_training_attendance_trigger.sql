/*
  # Auto-create training_attendance rows on training_sessions insert

  1. New function
    - `create_training_attendance_for_session()` — AFTER INSERT trigger function that
      creates one `training_attendance` row per team member for the newly inserted
      session, with `status='pending'`, `present=false`, `responded_at=NULL`.

  2. New trigger
    - `auto_create_training_attendance` on `training_sessions` AFTER INSERT FOR EACH ROW.

  3. Backfill
    - Insert missing `training_attendance` rows for every existing session where a team
      member currently has no attendance row.

  Notes:
  - Idempotent: the function uses NOT EXISTS to avoid duplicate rows.
  - Safe for re-runs: trigger is DROPped before CREATE.
*/

CREATE OR REPLACE FUNCTION create_training_attendance_for_session()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO training_attendance (session_id, member_id, status, present)
  SELECT NEW.id, m.id, 'pending', false
  FROM members m
  WHERE m.team_id = NEW.team_id
    AND NOT EXISTS (
      SELECT 1 FROM training_attendance
      WHERE session_id = NEW.id AND member_id = m.id
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_create_training_attendance ON training_sessions;

CREATE TRIGGER auto_create_training_attendance
AFTER INSERT ON training_sessions
FOR EACH ROW EXECUTE FUNCTION create_training_attendance_for_session();

INSERT INTO training_attendance (session_id, member_id, status, present)
SELECT ts.id, m.id, 'pending', false
FROM training_sessions ts
JOIN members m ON m.team_id = ts.team_id
WHERE NOT EXISTS (
  SELECT 1 FROM training_attendance ta
  WHERE ta.session_id = ts.id AND ta.member_id = m.id
);
