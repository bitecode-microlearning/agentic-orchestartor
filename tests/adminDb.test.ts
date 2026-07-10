import { describe, expect, it } from 'vitest';
import { createAdminSchemaSql } from '../src/adminDb';

describe('admin database schema', () => {
  it('contains admin users table', () => {
    const sql = createAdminSchemaSql();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS admin_users');
  });

  it('contains admin sessions table', () => {
    const sql = createAdminSchemaSql();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS admin_sessions');
  });

  it('contains admin audit and command tables', () => {
    const sql = createAdminSchemaSql();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS admin_audit_logs');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS admin_agent_commands');
  });
});
