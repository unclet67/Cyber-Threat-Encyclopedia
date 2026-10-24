CREATE TABLE campaign_assessments (
 id TEXT NOT NULL, user_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 base_document TEXT NOT NULL, document TEXT NOT NULL, revision INTEGER NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY (user_id,id)
);
CREATE INDEX campaign_assessments_actor ON campaign_assessments(user_id,actor_id,created_at);
