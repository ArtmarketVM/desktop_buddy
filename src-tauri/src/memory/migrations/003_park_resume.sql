-- Persist workflow metadata without copying screen or Accessibility text.
ALTER TABLE work_contexts ADD COLUMN last_result TEXT;
ALTER TABLE work_contexts ADD COLUMN parked_at TEXT;
ALTER TABLE work_contexts ADD COLUMN resumed_at TEXT;
-- Existing parked checkpoints must not disappear through automatic owner retention.
UPDATE work_contexts SET parked_at=updated_at WHERE status IN ('paused','waiting');
