-- Bind the chat independently of workflow status, including an ended or paused session.
CREATE TABLE coaching_chat_bindings (
    conversation_id INTEGER PRIMARY KEY REFERENCES buddy_conversations(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL UNIQUE REFERENCES coaching_sessions(id) ON DELETE CASCADE
);
INSERT INTO coaching_chat_bindings(conversation_id,session_id)
SELECT conversation_id,MAX(id) FROM coaching_sessions GROUP BY conversation_id;
CREATE TABLE coaching_chat_starts (
    request_id TEXT PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
    request TEXT NOT NULL
);
-- Reuse the existing message store; retain only identifiers and structured request metadata.
CREATE TABLE coaching_chat_turns (
    request_id TEXT PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
    request TEXT NOT NULL,
    user_message_id INTEGER NOT NULL REFERENCES buddy_messages(id) ON DELETE CASCADE,
    assistant_message_id INTEGER REFERENCES buddy_messages(id) ON DELETE CASCADE
);
