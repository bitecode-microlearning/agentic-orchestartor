-- BiteCode Operations Agent MVP operational metadata.
CREATE TABLE IF NOT EXISTS agent_tasks(id TEXT PRIMARY KEY,type TEXT,source TEXT,status TEXT,priority TEXT,input TEXT,result TEXT,error TEXT,created_at TEXT,started_at TEXT,completed_at TEXT,correlation_id TEXT);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_created ON agent_tasks(status,created_at);
CREATE TABLE IF NOT EXISTS system_observations(id TEXT PRIMARY KEY,source TEXT,category TEXT,severity TEXT,service TEXT,environment TEXT,timestamp TEXT,summary TEXT,fingerprint TEXT,metadata TEXT,task_id TEXT, UNIQUE(fingerprint,timestamp,summary));
CREATE INDEX IF NOT EXISTS idx_obs_fp ON system_observations(fingerprint);
CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY,fingerprint TEXT,title TEXT,service TEXT,environment TEXT,severity TEXT,status TEXT,occurrence_count INTEGER,first_seen_at TEXT,last_seen_at TEXT,latest_observation_id TEXT,diagnosis TEXT,jira_issue_key TEXT,telegram_message_id TEXT,last_notified_at TEXT);
CREATE INDEX IF NOT EXISTS idx_inc_fp ON incidents(fingerprint);
CREATE INDEX IF NOT EXISTS idx_inc_status_sev ON incidents(status,severity);
CREATE TABLE IF NOT EXISTS approval_requests(id TEXT PRIMARY KEY,token TEXT UNIQUE,action TEXT,resource_type TEXT,resource_id TEXT,status TEXT,requested_at TEXT,expires_at TEXT,decided_at TEXT,decided_by TEXT,execution_result TEXT);
CREATE INDEX IF NOT EXISTS idx_approval_token_status ON approval_requests(token,status);
CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY,correlation_id TEXT,event_type TEXT,actor TEXT,resource_type TEXT,resource_id TEXT,timestamp TEXT,environment TEXT,outcome TEXT,metadata TEXT,r2_key TEXT);
CREATE INDEX IF NOT EXISTS idx_audit_corr_ts ON audit_events(correlation_id,timestamp);
CREATE TABLE IF NOT EXISTS runtime_state(id TEXT PRIMARY KEY,paused INTEGER,paused_at TEXT,paused_by TEXT,pause_reason TEXT,last_scheduled_run_at TEXT,last_successful_run_at TEXT,last_failed_run_at TEXT);
