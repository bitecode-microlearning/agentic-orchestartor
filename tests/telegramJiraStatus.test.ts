import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleTelegramAdminWebhook, type AdminServiceEnv } from '../src/adminService';

function createD1Stub(): D1Database {
  return {
    exec: vi.fn(async () => undefined),
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ success: true })),
        all: vi.fn(async () => ({ results: [] })),
      })),
    })),
  } as unknown as D1Database;
}

function createTelegramEnv(): AdminServiceEnv {
  return {
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_WEBHOOK_SECRET: 'secret',
    TELEGRAM_ADMIN_CHAT_IDS: '123',
    ATLASSIAN_BASE_URL: 'https://bitecode.atlassian.net',
    ATLASSIAN_EMAIL: 'ops@example.com',
    ATLASSIAN_API_TOKEN: 'token',
    JIRA_PROJECT_KEY: 'BC',
    AGENT_DB: createD1Stub(),
    ADMIN_DB: createD1Stub(),
  };
}

describe('telegram Jira status command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles /jiracheck status without also running a free-text Jira lookup', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/sendMessage')) {
        return Response.json({ ok: true });
      }
      if (url.includes('/rest/api/3/issue/') || url.includes('status%20open')) {
        throw new Error(`unexpected Jira check lookup: ${url}`);
      }

      return Response.json({
        issues: [
          {
            key: 'BC-123',
            fields: {
              summary: 'Fix webhook status command',
              status: { name: 'In Progress' },
              updated: '2026-07-12T10:00:00.000Z',
            },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleTelegramAdminWebhook(
      new Request('https://worker.example.com/api/telegram/webhook/secret', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1001,
          message: {
            message_id: 10,
            text: '/jiracheck status open',
            chat: { id: 123, type: 'private' },
          },
        }),
      }),
      createTelegramEnv(),
    );

    expect(response?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('statusCategory%20!%3D%20Done');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/sendMessage');
  });

  it('returns an error instead of marking an update processed when Telegram send fails', async () => {
    const preparedSql: string[] = [];
    const adminDb = {
      exec: vi.fn(async () => undefined),
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql);
        return {
          bind: vi.fn((..._args: unknown[]) => ({
            first: vi.fn(async () => null),
            run: vi.fn(async () => ({ success: true })),
            all: vi.fn(async () => ({ results: [] })),
          })),
        };
      }),
    } as unknown as D1Database;
    const env = { ...createTelegramEnv(), ADMIN_DB: adminDb };
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid token', { status: 401 })));

    const response = await handleTelegramAdminWebhook(
      new Request('https://worker.example.com/api/telegram/webhook/secret', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1002,
          message: {
            message_id: 11,
            text: '/help',
            chat: { id: 123, type: 'private' },
          },
        }),
      }),
      env,
    );

    expect(response?.status).toBe(502);
    expect(preparedSql.some((sql) => sql.includes('INSERT OR IGNORE INTO telegram_webhook_events'))).toBe(false);
    expect(preparedSql.some((sql) => sql.includes('admin_audit_logs'))).toBe(true);
  });
});
