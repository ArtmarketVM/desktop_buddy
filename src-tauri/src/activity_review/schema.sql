CREATE TABLE IF NOT EXISTS review_periods (
    id INTEGER PRIMARY KEY,
    day TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL UNIQUE,
    summary TEXT,
    analysis_done INTEGER NOT NULL DEFAULT 0,
    retry_after TEXT,
    finalized_at TEXT
);
CREATE TABLE IF NOT EXISTS review_contexts (
    period_id INTEGER NOT NULL REFERENCES review_periods(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL,
    app TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    proposed_title TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT 'Not enough context to identify a goal',
    final_reviewed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(period_id,context_key)
);
CREATE TABLE IF NOT EXISTS review_intervals (
    id INTEGER PRIMARY KEY,
    period_id INTEGER NOT NULL REFERENCES review_periods(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    milliseconds INTEGER NOT NULL CHECK(milliseconds > 0 AND milliseconds <= 15000),
    app TEXT NOT NULL,
    title TEXT NOT NULL,
    domain TEXT,
    source_id INTEGER UNIQUE REFERENCES usage_intervals(id) ON DELETE SET NULL,
    source_step TEXT NOT NULL DEFAULT '',
    goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','assigned','outside')),
    reason TEXT NOT NULL,
    manual INTEGER NOT NULL DEFAULT 0,
    UNIQUE(started_at,ended_at)
);
CREATE INDEX IF NOT EXISTS review_intervals_context ON review_intervals(period_id,context_key);
CREATE TABLE IF NOT EXISTS review_evidence (
    id INTEGER PRIMARY KEY,
    period_id INTEGER NOT NULL REFERENCES review_periods(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('text','image')),
    fingerprint TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    encrypted BLOB NOT NULL,
    analyzed INTEGER NOT NULL DEFAULT 0,
    UNIQUE(period_id,context_key,kind,fingerprint)
);
