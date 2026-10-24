CREATE TABLE watchlist (
 user_id TEXT NOT NULL, actor_id TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
 enabled INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,actor_id)
);
CREATE INDEX research_jobs_budget_time ON research_jobs(created_at,user_id);
