-- One bounded checkpoint per goal and local calendar day. No window or Accessibility text.
CREATE TABLE IF NOT EXISTS continuity_checkpoints (
    context_id INTEGER NOT NULL REFERENCES work_contexts(id) ON DELETE CASCADE,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    step_id TEXT,
    summary TEXT NOT NULL,
    next_action TEXT,
    status TEXT NOT NULL,
    waiting_for TEXT,
    last_result TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(goal_id,day)
);
CREATE INDEX IF NOT EXISTS continuity_day ON continuity_checkpoints(day,goal_id);
CREATE TRIGGER IF NOT EXISTS continuity_context_insert AFTER INSERT ON work_contexts
WHEN date(NEW.updated_at,'localtime') IS NOT NULL AND (SELECT enabled AND remember_work_context FROM memory_controls WHERE id=1)
BEGIN
    INSERT INTO continuity_checkpoints VALUES(NEW.id,NEW.goal_id,date(NEW.updated_at,'localtime'),NEW.step_id,NEW.summary,NEW.next_action,NEW.status,NEW.waiting_for,NEW.last_result,NEW.updated_at)
    ON CONFLICT(goal_id,day) DO UPDATE SET step_id=excluded.step_id,summary=excluded.summary,next_action=excluded.next_action,status=excluded.status,waiting_for=excluded.waiting_for,last_result=excluded.last_result,updated_at=excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS continuity_context_update AFTER UPDATE ON work_contexts
WHEN date(NEW.updated_at,'localtime') IS NOT NULL AND (SELECT enabled AND remember_work_context FROM memory_controls WHERE id=1)
 AND (NEW.summary!=OLD.summary OR NEW.next_action IS NOT OLD.next_action OR NEW.status!=OLD.status OR NEW.waiting_for IS NOT OLD.waiting_for OR NEW.step_id IS NOT OLD.step_id OR NEW.last_result IS NOT OLD.last_result OR NEW.updated_at!=OLD.updated_at)
BEGIN
    INSERT INTO continuity_checkpoints VALUES(NEW.id,NEW.goal_id,date(NEW.updated_at,'localtime'),NEW.step_id,NEW.summary,NEW.next_action,NEW.status,NEW.waiting_for,NEW.last_result,NEW.updated_at)
    ON CONFLICT(goal_id,day) DO UPDATE SET step_id=excluded.step_id,summary=excluded.summary,next_action=excluded.next_action,status=excluded.status,waiting_for=excluded.waiting_for,last_result=excluded.last_result,updated_at=excluded.updated_at;
END;
