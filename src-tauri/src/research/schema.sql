-- Additive migration. Existing goals, chats, activity and checkpoints remain untouched.
CREATE TABLE IF NOT EXISTS contextual_research (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    step_id TEXT,
    context_id INTEGER REFERENCES work_contexts(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    consent_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('authorized','running','ready','failed')),
    result_json TEXT,
    helpful INTEGER CHECK(helpful IN (0,1)),
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS contextual_research_goal ON contextual_research(goal_id,id);
