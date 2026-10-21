CREATE TABLE IF NOT EXISTS work_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evidence_key TEXT NOT NULL UNIQUE,
    goal_id INTEGER REFERENCES goals(id) ON DELETE CASCADE,
    step_id TEXT,
    title TEXT NOT NULL,
    app TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('observed','automatic_verified','user_confirmed_unplanned','user_planned')),
    status TEXT NOT NULL CHECK(status IN ('observed','completed','planned','undone')),
    core_event_id INTEGER REFERENCES core_events(id) ON DELETE SET NULL,
    source_event_id INTEGER REFERENCES work_events(id) ON DELETE SET NULL,
    receipt_key TEXT UNIQUE,
    undo_plan TEXT,
    after_revision INTEGER
);
CREATE INDEX IF NOT EXISTS work_events_time ON work_events(occurred_at);
