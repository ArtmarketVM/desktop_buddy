-- Separate controls and bounded, content-free retrieval diagnostics.
CREATE TABLE memory_controls (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 remember_work_context INTEGER NOT NULL CHECK(remember_work_context IN (0,1)),
 remember_preferences INTEGER NOT NULL CHECK(remember_preferences IN (0,1)),
 learn_from_feedback INTEGER NOT NULL CHECK(learn_from_feedback IN (0,1)),
 remember_conversation_context INTEGER NOT NULL CHECK(remember_conversation_context IN (0,1))
);
INSERT INTO memory_controls VALUES(1,1,1,1,1,1);
ALTER TABLE memories ADD COLUMN step_id TEXT;
ALTER TABLE work_contexts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1));
CREATE INDEX memories_step ON memories(goal_id,step_id,archived);
CREATE TABLE memory_retrieval_debug(id INTEGER PRIMARY KEY CHECK(id=1), metadata TEXT NOT NULL);
CREATE TABLE memory_proposals (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 500),
 conversation_id INTEGER NOT NULL REFERENCES buddy_conversations(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL,
 UNIQUE(content,conversation_id)
);
DROP TRIGGER memory_core_completion;
CREATE TRIGGER memory_core_completion AFTER INSERT ON core_events
WHEN (SELECT enabled AND remember_work_context FROM memory_controls WHERE id=1) AND NEW.kind IN ('completed','reopened')
BEGIN
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at,step_id)
    VALUES('episodic','goal',NEW.goal_id,NEW.goal_id,
        CASE WHEN NEW.step_id='goal' THEN CASE NEW.kind WHEN 'completed' THEN 'Goal completed' ELSE 'Goal resumed' END ELSE CASE NEW.kind WHEN 'completed' THEN 'Step completed' ELSE 'Step reopened' END END,
        CASE WHEN NEW.step_id='goal' THEN CASE NEW.kind WHEN 'completed' THEN 'goal_completed' ELSE 'goal_resumed' END ELSE CASE NEW.kind WHEN 'completed' THEN 'step_completed' ELSE 'step_reopened' END END,
        1,'confirmed_event',1,'core-event:'||NEW.id||':'||NEW.created_at,NEW.created_at,NEW.created_at,CASE WHEN NEW.step_id='goal' THEN NULL ELSE NEW.step_id END);
    UPDATE work_contexts SET status='completed',waiting_for=NULL,updated_at=NEW.created_at WHERE goal_id=NEW.goal_id AND NEW.step_id='goal' AND NEW.kind='completed';
    UPDATE work_contexts SET step_id=NULL,next_action=NULL,updated_at=NEW.created_at WHERE goal_id=NEW.goal_id AND step_id=NEW.step_id AND NEW.kind='completed';
END;

DROP TRIGGER memory_goal_started;
CREATE TRIGGER memory_goal_started AFTER UPDATE OF status ON goals
WHEN (SELECT enabled AND remember_work_context FROM memory_controls WHERE id=1) AND NEW.status='active' AND OLD.status!='active'
 AND NOT EXISTS(SELECT 1 FROM memories WHERE goal_id=NEW.id AND event_kind='goal_started')
BEGIN
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at,step_id)
    VALUES('episodic','goal',NEW.id,NEW.id,'Goal selected for work','goal_started',1,'confirmed_event',1,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL);
    INSERT INTO work_contexts(goal_id,summary,status,created_at,updated_at)
    VALUES(NEW.id,'Work started on this goal','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(goal_id) DO UPDATE SET status='active',updated_at=excluded.updated_at;
END;

DROP TRIGGER memory_goal_lifecycle;
CREATE TRIGGER memory_goal_lifecycle AFTER UPDATE OF state ON core_goals
WHEN (SELECT enabled AND remember_work_context FROM memory_controls WHERE id=1) AND OLD.state!=NEW.state AND (NEW.state='deferred' OR (NEW.state='open' AND OLD.state='deferred'))
BEGIN
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at,step_id)
    VALUES('episodic','goal',NEW.goal_id,NEW.goal_id,CASE NEW.state WHEN 'deferred' THEN 'Goal set aside' ELSE 'Goal resumed' END,
        CASE NEW.state WHEN 'deferred' THEN 'goal_parked' ELSE 'goal_resumed' END,1,'confirmed_event',1,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL);
    UPDATE work_contexts SET status=CASE NEW.state WHEN 'deferred' THEN 'paused' ELSE 'active' END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE goal_id=NEW.goal_id;
END;

DROP TRIGGER memory_goal_correction;
CREATE TRIGGER memory_goal_correction AFTER UPDATE OF text ON goals WHEN (SELECT enabled AND remember_work_context FROM memory_controls WHERE id=1) AND OLD.text!=NEW.text
BEGIN
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at,step_id)
    VALUES('episodic','goal',NEW.id,NEW.id,'Goal renamed','meaningful_correction',1,'confirmed_event',1,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL);
END;

DROP TRIGGER memory_step_context;
CREATE TRIGGER memory_step_context AFTER UPDATE OF payload ON goal_plans
WHEN (SELECT enabled AND remember_work_context FROM memory_controls WHERE id=1)
BEGIN
    UPDATE work_contexts SET step_id=NULL,next_action=NULL,status='paused',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE goal_id=NEW.goal_id AND step_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.steps') WHERE json_extract(value,'$.id')=work_contexts.step_id);
    INSERT INTO memories(memory_type,scope_type,scope_id,goal_id,content,event_kind,confidence,source,evidence_count,source_key,created_at,updated_at,step_id)
    SELECT 'episodic','goal',NEW.goal_id,NEW.goal_id,'Step text corrected','meaningful_correction',1,'confirmed_event',1,
        'step-edit:'||NEW.goal_id||':'||json_extract(n.value,'$.id')||':'||NEW.revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),json_extract(n.value,'$.id')
    FROM json_each(NEW.payload,'$.steps') n JOIN json_each(OLD.payload,'$.steps') o ON json_extract(n.value,'$.id')=json_extract(o.value,'$.id')
    WHERE json_extract(n.value,'$.text')!=json_extract(o.value,'$.text');
END;
