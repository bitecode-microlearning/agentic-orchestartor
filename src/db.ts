export interface RunRecord {
  id: string;
  requestId: string;
  runType: string;
  status: string;
  summary: string;
  startedAt: string;
  finishedAt?: string;
}

export interface LogRecord {
  id: string;
  runId?: string;
  level: string;
  message: string;
  createdAt: string;
}

export interface ChatRecord {
  id: string;
  channel: 'web' | 'telegram';
  actor: string;
  message: string;
  response: string;
  createdAt: string;
}

export async function ensureSchema(db: D1Database): Promise<void> {
  await db.exec(createSchemaSql());
}

export function createSchemaSql(): string {
  return [
    'CREATE TABLE IF NOT EXISTS workflow_runs (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, run_type TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT);',
    'CREATE TABLE IF NOT EXISTS run_logs (id TEXT PRIMARY KEY, run_id TEXT, level TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, channel TEXT NOT NULL, actor TEXT NOT NULL, message TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL);',
  ].join('\n');
}

export async function insertRun(db: D1Database, run: RunRecord): Promise<void> {
  await db
    .prepare(
      'INSERT INTO workflow_runs (id, request_id, run_type, status, summary, started_at, finished_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    )
    .bind(run.id, run.requestId, run.runType, run.status, run.summary, run.startedAt, run.finishedAt ?? null)
    .run();
}

export async function updateRunStatus(
  db: D1Database,
  runId: string,
  status: string,
  summary: string,
  finishedAt: string,
): Promise<void> {
  await db
    .prepare('UPDATE workflow_runs SET status = ?1, summary = ?2, finished_at = ?3 WHERE id = ?4')
    .bind(status, summary, finishedAt, runId)
    .run();
}

export async function listRuns(db: D1Database, limit = 50): Promise<RunRecord[]> {
  const result = await db
    .prepare(
      'SELECT id, request_id as requestId, run_type as runType, status, summary, started_at as startedAt, finished_at as finishedAt FROM workflow_runs ORDER BY started_at DESC LIMIT ?1',
    )
    .bind(limit)
    .all<RunRecord>();

  return result.results ?? [];
}

export async function insertLog(db: D1Database, log: LogRecord): Promise<void> {
  await db
    .prepare('INSERT INTO run_logs (id, run_id, level, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(log.id, log.runId ?? null, log.level, log.message, log.createdAt)
    .run();
}

export async function listLogs(db: D1Database, runId?: string, limit = 200): Promise<LogRecord[]> {
  if (runId) {
    const scoped = await db
      .prepare(
        'SELECT id, run_id as runId, level, message, created_at as createdAt FROM run_logs WHERE run_id = ?1 ORDER BY created_at DESC LIMIT ?2',
      )
      .bind(runId, limit)
      .all<LogRecord>();
    return scoped.results ?? [];
  }

  const result = await db
    .prepare(
      'SELECT id, run_id as runId, level, message, created_at as createdAt FROM run_logs ORDER BY created_at DESC LIMIT ?1',
    )
    .bind(limit)
    .all<LogRecord>();

  return result.results ?? [];
}

export async function insertChatMessage(db: D1Database, chat: ChatRecord): Promise<void> {
  await db
    .prepare(
      'INSERT INTO chat_messages (id, channel, actor, message, response, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    )
    .bind(chat.id, chat.channel, chat.actor, chat.message, chat.response, chat.createdAt)
    .run();
}

export async function listChatMessages(db: D1Database, limit = 100): Promise<ChatRecord[]> {
  const result = await db
    .prepare(
      'SELECT id, channel, actor, message, response, created_at as createdAt FROM chat_messages ORDER BY created_at DESC LIMIT ?1',
    )
    .bind(limit)
    .all<ChatRecord>();

  return result.results ?? [];
}
