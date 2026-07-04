export interface AuditRecord {
  id: string;
  requestId: string;
  status: 'accepted' | 'blocked';
  summary: string;
}

export function createAuditRecord(record: AuditRecord): AuditRecord {
  return {
    ...record,
  };
}

export function createSchemaSql(): string {
  return [
    'CREATE TABLE IF NOT EXISTS workflow_runs (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS audit_entries (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL);',
  ].join('\n');
}
