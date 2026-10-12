CREATE TABLE memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_type TEXT NOT NULL CHECK(memory_type IN ('explicit_fact','explicit_preference','inferred_preference','behavioral_pattern','episodic')),
    scope_type TEXT NOT NULL CHECK(scope_type IN ('global','goal','conversation')),
    scope_id INTEGER,
    goal_id INTEGER REFERENCES goals(id) ON DELETE CASCADE,
    conversation_id INTEGER REFERENCES buddy_conversations(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 500),
    event_kind TEXT CHECK(event_kind IN ('goal_started','goal_parked','goal_resumed','step_completed','step_reopened','goal_completed','intervention_accepted','intervention_rejected','research_accepted','research_rejected','waiting_state','meaningful_correction')),
    confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
    source TEXT NOT NULL CHECK(source IN ('user','setting','confirmed_event','intervention_feedback','research_feedback','verified_events')),
    evidence_count INTEGER NOT NULL CHECK(evidence_count >= 1),
    source_key TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_used_at TEXT,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
    archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
    CHECK((scope_type='global' AND scope_id IS NULL AND goal_id IS NULL AND conversation_id IS NULL)
       OR (scope_type='goal' AND scope_id=goal_id AND goal_id IS NOT NULL AND conversation_id IS NULL)
       OR (scope_type='conversation' AND scope_id=conversation_id AND conversation_id IS NOT NULL AND goal_id IS NULL)),
    CHECK((memory_type='episodic' AND event_kind IS NOT NULL) OR (memory_type!='episodic' AND event_kind IS NULL)),
    CHECK(memory_type NOT IN ('inferred_preference','behavioral_pattern') OR (evidence_count>=3 AND confidence>=0.85 AND source='verified_events'))
);
CREATE INDEX memories_scope ON memories(scope_type,scope_id,archived,updated_at DESC);
CREATE INDEX memories_type_recent ON memories(memory_type,archived,updated_at DESC);

CREATE TABLE work_contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL UNIQUE REFERENCES goals(id) ON DELETE CASCADE,
    step_id TEXT,
    summary TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 1 AND 500),
    next_action TEXT CHECK(next_action IS NULL OR length(next_action) BETWEEN 1 AND 500),
    status TEXT NOT NULL CHECK(status IN ('active','paused','waiting','completed')),
    last_app TEXT CHECK(last_app IS NULL OR length(last_app) BETWEEN 1 AND 120),
    last_window TEXT CHECK(last_window IS NULL OR length(last_window) BETWEEN 1 AND 160),
    waiting_for TEXT CHECK(waiting_for IS NULL OR length(waiting_for) BETWEEN 1 AND 500),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(status!='waiting' OR waiting_for IS NOT NULL)
);

CREATE TABLE memory_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_type TEXT NOT NULL CHECK(memory_type IN ('inferred_preference','behavioral_pattern')),
    scope_type TEXT NOT NULL,
    scope_key INTEGER NOT NULL,
    content TEXT NOT NULL,
    episode_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    confidence REAL NOT NULL CHECK(confidence BETWEEN 0.85 AND 1),
    created_at TEXT NOT NULL,
    UNIQUE(memory_type,scope_type,scope_key,content,episode_id)
);
CREATE INDEX memory_evidence_proposal ON memory_evidence(memory_type,scope_type,scope_key,content);

-- Only confirmed application events are mirrored. No activity or Accessibility text is copied.
CREATE TRIGGER memory_core_completion AFTER INSERT ON core_events
WHEN NEW.kind IN ('completed','reopened')
BEGIN
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at)
    VALUES('episodic','goal',NEW.goal_id,NEW.goal_id,
        CASE WHEN NEW.step_id='goal' THEN CASE NEW.kind WHEN 'completed' THEN 'Goal completed' ELSE 'Goal resumed' END ELSE CASE NEW.kind WHEN 'completed' THEN 'Step completed' ELSE 'Step reopened' END END,
        CASE WHEN NEW.step_id='goal' THEN CASE NEW.kind WHEN 'completed' THEN 'goal_completed' ELSE 'goal_resumed' END ELSE CASE NEW.kind WHEN 'completed' THEN 'step_completed' ELSE 'step_reopened' END END,
        1,'confirmed_event',1,'core-event:'||NEW.id||':'||NEW.created_at,NEW.created_at,NEW.created_at);
    UPDATE work_contexts SET status='completed',waiting_for=NULL,updated_at=NEW.created_at WHERE goal_id=NEW.goal_id AND NEW.step_id='goal' AND NEW.kind='completed';
    UPDATE work_contexts SET step_id=NULL,next_action=NULL,updated_at=NEW.created_at WHERE goal_id=NEW.goal_id AND step_id=NEW.step_id AND NEW.kind='completed';
END;

CREATE TRIGGER memory_goal_started AFTER UPDATE OF status ON goals
WHEN NEW.status='active' AND OLD.status!='active'
 AND NOT EXISTS(SELECT 1 FROM memories WHERE goal_id=NEW.id AND event_kind='goal_started')
BEGIN
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at)
    VALUES('episodic','goal',NEW.id,NEW.id,'Goal selected for work','goal_started',1,'confirmed_event',1,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    INSERT INTO work_contexts(goal_id,summary,status,created_at,updated_at)
    VALUES(NEW.id,'Work started on this goal','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(goal_id) DO UPDATE SET status='active',updated_at=excluded.updated_at;
END;

CREATE TRIGGER memory_goal_lifecycle AFTER UPDATE OF state ON core_goals
WHEN OLD.state!=NEW.state AND (NEW.state='deferred' OR (NEW.state='open' AND OLD.state='deferred'))
BEGIN
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at)
    VALUES('episodic','goal',NEW.goal_id,NEW.goal_id,CASE NEW.state WHEN 'deferred' THEN 'Goal set aside' ELSE 'Goal resumed' END,
        CASE NEW.state WHEN 'deferred' THEN 'goal_parked' ELSE 'goal_resumed' END,1,'confirmed_event',1,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    UPDATE work_contexts SET status=CASE NEW.state WHEN 'deferred' THEN 'paused' ELSE 'active' END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE goal_id=NEW.goal_id;
END;

CREATE TRIGGER memory_goal_correction AFTER UPDATE OF text ON goals WHEN OLD.text!=NEW.text
BEGIN
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at)
    VALUES('episodic','goal',NEW.id,NEW.id,'Goal renamed','meaningful_correction',1,'confirmed_event',1,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER memory_step_context AFTER UPDATE OF payload ON goal_plans
BEGIN
    UPDATE work_contexts SET step_id=NULL,next_action=NULL,status='paused',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE goal_id=NEW.goal_id AND step_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.steps') WHERE json_extract(value,'$.id')=work_contexts.step_id);
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at)
    SELECT 'episodic','goal',NEW.goal_id,NEW.goal_id,'Step text corrected','meaningful_correction',1,'confirmed_event',1,
        'step-edit:'||NEW.goal_id||':'||json_extract(n.value,'$.id')||':'||NEW.revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM json_each(NEW.payload,'$.steps') n JOIN json_each(OLD.payload,'$.steps') o ON json_extract(n.value,'$.id')=json_extract(o.value,'$.id')
    WHERE json_extract(n.value,'$.text')!=json_extract(o.value,'$.text');
END;

-- Withdraw any inferred claim whose supporting episode is changed or removed.
CREATE TRIGGER memory_evidence_removed BEFORE DELETE ON memories WHEN OLD.memory_type='episodic'
BEGIN
    UPDATE memories SET archived=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE memory_type IN ('inferred_preference','behavioral_pattern') AND EXISTS(
        SELECT 1 FROM memory_evidence e WHERE e.episode_id=OLD.id AND e.memory_type=memories.memory_type
          AND e.scope_type=memories.scope_type AND e.scope_key=COALESCE(memories.scope_id,0) AND e.content=memories.content);
END;
CREATE TRIGGER memory_evidence_changed BEFORE UPDATE OF content,archived,event_kind,source ON memories
WHEN OLD.memory_type='episodic' AND (NEW.content!=OLD.content OR NEW.archived!=OLD.archived OR NEW.event_kind!=OLD.event_kind OR NEW.source!=OLD.source)
BEGIN
    UPDATE memories SET archived=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE memory_type IN ('inferred_preference','behavioral_pattern') AND EXISTS(
        SELECT 1 FROM memory_evidence e WHERE e.episode_id=OLD.id AND e.memory_type=memories.memory_type
          AND e.scope_type=memories.scope_type AND e.scope_key=COALESCE(memories.scope_id,0) AND e.content=memories.content);
    DELETE FROM memory_evidence WHERE episode_id=OLD.id;
END;
