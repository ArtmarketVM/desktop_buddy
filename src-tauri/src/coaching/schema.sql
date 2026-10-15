-- A database-wide clock prevents stale starts from matching a deleted/reused goal ID.
CREATE TABLE coaching_revision_clock (
    id INTEGER PRIMARY KEY CHECK(id=1),
    revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision >= 0)
);
INSERT INTO coaching_revision_clock VALUES(1,0);
CREATE TABLE coaching_goal_versions (
    goal_id INTEGER PRIMARY KEY REFERENCES goals(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0)
);
INSERT INTO coaching_goal_versions(goal_id,revision) SELECT id,id FROM goals;
UPDATE coaching_revision_clock SET revision=(SELECT COALESCE(MAX(revision),0) FROM coaching_goal_versions) WHERE id=1;
CREATE TRIGGER coaching_goal_insert AFTER INSERT ON goals BEGIN
    UPDATE coaching_revision_clock SET revision=revision+1 WHERE id=1;
    INSERT INTO coaching_goal_versions(goal_id,revision) SELECT NEW.id,revision FROM coaching_revision_clock WHERE id=1;
END;
CREATE TRIGGER coaching_goal_update AFTER UPDATE OF text,status ON goals BEGIN
    UPDATE coaching_revision_clock SET revision=revision+1 WHERE id=1;
    UPDATE coaching_goal_versions SET revision=(SELECT revision FROM coaching_revision_clock WHERE id=1) WHERE goal_id=NEW.id;
END;

CREATE TABLE coaching_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    conversation_id INTEGER NOT NULL REFERENCES buddy_conversations(id) ON DELETE CASCADE,
    strategy_id TEXT NOT NULL,
    strategy_version INTEGER NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    target_revision INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active','paused','completed','declined','blocked','invalidated')),
    payload TEXT NOT NULL,
    memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX coaching_active_goal ON coaching_sessions(goal_id) WHERE status IN ('active','paused');
CREATE UNIQUE INDEX coaching_active_conversation ON coaching_sessions(conversation_id) WHERE status IN ('active','paused');
CREATE INDEX coaching_retention ON coaching_sessions(updated_at);
CREATE TABLE coaching_requests (
    request_id TEXT PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
    request TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL
);
-- A remembered self-report belongs to the workflow that produced it. Forgetting
-- the fact cascades to its session; deleting its goal/chat/history removes both.
CREATE TRIGGER coaching_session_delete AFTER DELETE ON coaching_sessions BEGIN
    DELETE FROM memories WHERE id=OLD.memory_id;
END;
