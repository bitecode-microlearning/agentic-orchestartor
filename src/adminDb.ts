import { createRequestId } from './lib';

export interface AdminUserRecord {
  id: string;
  email: string;
  displayName: string;
  idpProvider: string;
  role: 'owner' | 'admin' | 'observer';
  isActive: number;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminAuditRecord {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadataJson?: string;
  createdAt: string;
}

export interface AdminCommandRecord {
  id: string;
  actorEmail: string;
  commandType: string;
  payloadJson?: string;
  status: string;
  linkedAgentRunId?: string;
  createdAt: string;
}

export interface AdminChatRecord {
  id: string;
  channel: 'web' | 'telegram';
  actorEmail: string;
  message: string;
  response: string;
  createdAt: string;
}

export interface TelegramWebhookEventRecord {
  updateId: number;
  chatId: string;
  messageId?: number;
  createdAt: string;
}

export function createAdminSchemaSql(): string {
  return [
    'CREATE TABLE IF NOT EXISTS admin_users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, idp_provider TEXT NOT NULL, role TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT);',
    'CREATE TABLE IF NOT EXISTS admin_sessions (id TEXT PRIMARY KEY, user_email TEXT NOT NULL, auth_type TEXT NOT NULL, idp_subject TEXT, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS admin_audit_logs (id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT, metadata_json TEXT, created_at TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS admin_agent_commands (id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, command_type TEXT NOT NULL, payload_json TEXT, status TEXT NOT NULL, linked_agent_run_id TEXT, created_at TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS admin_chat_messages (id TEXT PRIMARY KEY, channel TEXT NOT NULL, actor_email TEXT NOT NULL, message TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS telegram_webhook_events (update_id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL, message_id INTEGER, created_at TEXT NOT NULL);',
  ].join('\n');
}

export async function ensureAdminSchema(db: D1Database): Promise<void> {
  await db.exec(createAdminSchemaSql());
}

export async function upsertAdminUserOnLogin(
  db: D1Database,
  email: string,
  displayName: string,
  idpProvider = 'google',
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO admin_users (id, email, display_name, idp_provider, role, is_active, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6) ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, idp_provider = excluded.idp_provider, last_login_at = excluded.last_login_at',
    )
    .bind(createRequestId('admin-user'), email, displayName, idpProvider, 'admin', now)
    .run();
}

export async function recordAdminSession(
  db: D1Database,
  userEmail: string,
  authType: 'cloudflare-access' | 'token',
  idpSubject?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO admin_sessions (id, user_email, auth_type, idp_subject, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)',
    )
    .bind(createRequestId('admin-session'), userEmail, authType, idpSubject ?? null, now)
    .run();
}

export async function insertAdminAuditLog(
  db: D1Database,
  input: Omit<AdminAuditRecord, 'id' | 'createdAt'>,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO admin_audit_logs (id, actor_email, action, target_type, target_id, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    )
    .bind(
      createRequestId('admin-audit'),
      input.actorEmail,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.metadataJson ?? null,
      now,
    )
    .run();
}

export async function insertAdminCommand(
  db: D1Database,
  input: Omit<AdminCommandRecord, 'id' | 'createdAt'>,
): Promise<string> {
  const now = new Date().toISOString();
  const id = createRequestId('admin-cmd');
  await db
    .prepare(
      'INSERT INTO admin_agent_commands (id, actor_email, command_type, payload_json, status, linked_agent_run_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    )
    .bind(id, input.actorEmail, input.commandType, input.payloadJson ?? null, input.status, input.linkedAgentRunId ?? null, now)
    .run();
  return id;
}

export async function updateAdminCommandStatus(
  db: D1Database,
  commandId: string,
  status: string,
  linkedAgentRunId?: string,
): Promise<void> {
  await db
    .prepare('UPDATE admin_agent_commands SET status = ?1, linked_agent_run_id = ?2 WHERE id = ?3')
    .bind(status, linkedAgentRunId ?? null, commandId)
    .run();
}

export async function insertAdminChatMessage(db: D1Database, chat: Omit<AdminChatRecord, 'id' | 'createdAt'>): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO admin_chat_messages (id, channel, actor_email, message, response, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    )
    .bind(createRequestId('admin-chat'), chat.channel, chat.actorEmail, chat.message, chat.response, now)
    .run();
}

export async function listAdminUsers(db: D1Database, limit = 200): Promise<AdminUserRecord[]> {
  const result = await db
    .prepare(
      'SELECT id, email, display_name as displayName, idp_provider as idpProvider, role, is_active as isActive, created_at as createdAt, last_login_at as lastLoginAt FROM admin_users ORDER BY created_at DESC LIMIT ?1',
    )
    .bind(limit)
    .all<AdminUserRecord>();
  return result.results ?? [];
}

export async function listAdminAuditLogs(db: D1Database, limit = 200): Promise<AdminAuditRecord[]> {
  const result = await db
    .prepare(
      'SELECT id, actor_email as actorEmail, action, target_type as targetType, target_id as targetId, metadata_json as metadataJson, created_at as createdAt FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?1',
    )
    .bind(limit)
    .all<AdminAuditRecord>();
  return result.results ?? [];
}

export async function listAdminCommands(db: D1Database, limit = 200): Promise<AdminCommandRecord[]> {
  const result = await db
    .prepare(
      'SELECT id, actor_email as actorEmail, command_type as commandType, payload_json as payloadJson, status, linked_agent_run_id as linkedAgentRunId, created_at as createdAt FROM admin_agent_commands ORDER BY created_at DESC LIMIT ?1',
    )
    .bind(limit)
    .all<AdminCommandRecord>();
  return result.results ?? [];
}

export async function listAdminChatMessages(db: D1Database, limit = 200): Promise<AdminChatRecord[]> {
  const result = await db
    .prepare(
      'SELECT id, channel, actor_email as actorEmail, message, response, created_at as createdAt FROM admin_chat_messages ORDER BY created_at DESC LIMIT ?1',
    )
    .bind(limit)
    .all<AdminChatRecord>();

    export async function hasTelegramUpdateBeenProcessed(db: D1Database, updateId: number): Promise<boolean> {
      const result = await db
        .prepare('SELECT update_id as updateId FROM telegram_webhook_events WHERE update_id = ?1 LIMIT 1')
        .bind(updateId)
        .first<TelegramWebhookEventRecord>();

      return Boolean(result);
    }

    export async function markTelegramUpdateProcessed(
      db: D1Database,
      updateId: number,
      chatId: string,
      messageId?: number,
    ): Promise<void> {
      const now = new Date().toISOString();
      await db
        .prepare('INSERT OR IGNORE INTO telegram_webhook_events (update_id, chat_id, message_id, created_at) VALUES (?1, ?2, ?3, ?4)')
        .bind(updateId, chatId, messageId ?? null, now)
        .run();
    }
  return result.results ?? [];
}
