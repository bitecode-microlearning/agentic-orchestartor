import { runWeeklyReview } from './agentService';
import { handleAdminRoutes, handleTelegramAdminWebhook } from './adminService';
import { ensureSchema } from './db';
import { ensureOpsSchema, handleInternal, handleOpsTelegram, getState, runHealthCheck } from './ops';

export interface Env {
  ENVIRONMENT?: string;
  AGENTIC_ADMIN_TOKEN?: string;
  ALLOWED_GOOGLE_DOMAIN?: string;
  ADMIN_EMAIL_ALLOWLIST?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ADMIN_CHAT_IDS?: string;
  TELEGRAM_ALLOWED_USER_IDS?: string;
  TELEGRAM_CHAT_ID?: string;
  INTERNAL_STATUS_SECRET?: string;
  ATLASSIAN_API_TOKEN?: string;
  JIRA_BASE_URL?: string;
  JIRA_USER_EMAIL?: string;
  JIRA_API_TOKEN?: string;
  JIRA_PROJECT_KEY?: string;
  AI_MODEL?: string;
  INCIDENT_NOTIFICATION_THRESHOLDS?: string;
  INCIDENT_REOPEN_COOLDOWN_MINUTES?: string;
  APPROVAL_EXPIRATION_MINUTES?: string;
  HEALTH_CHECK_TIMEOUT_MS?: string;
  AGENT_ENABLED?: string;
  AGENT_DB: D1Database;
  AI_AUDIT_BUCKET?: R2Bucket;
  ADMIN_DB: D1Database;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    await ensureSchema(env.AGENT_DB);
    await ensureOpsSchema(env.AGENT_DB);

    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      return handleOpsTelegram(request, env);
    }

    if (url.pathname.startsWith('/internal/')) {
      const internal = await handleInternal(url, request, env);
      if (internal) return internal;
    }

    if (url.pathname === '/health') {
      return json({ ok: true, status: 'healthy', service: 'bitecode-agentic-orchestrator' });
    }

    const adminResponse = await handleAdminRoutes(request, env);
    if (adminResponse) {
      return adminResponse;
    }

    const telegramResponse = await handleTelegramAdminWebhook(request, env);
    if (telegramResponse) {
      return telegramResponse;
    }

    if (url.pathname === '/admin/run-weekly-review') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const auth = request.headers.get('x-admin-token') ?? '';
      if (auth !== env.AGENTIC_ADMIN_TOKEN) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }

      const actor = request.headers.get('x-actor') ?? 'admin';
      const result = await runWeeklyReview(env, actor);
      return json(result, result.ok ? 200 : 403);
    }

    return new Response('Not found', { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      await ensureSchema(env.AGENT_DB);
      await ensureOpsSchema(env.AGENT_DB);
      const state = await getState(env);
      if (!state.paused) await runHealthCheck(env, 'schedule');
    })());
  },
} satisfies ExportedHandler<Env>;
