import { runWeeklyReview } from './agentService';
import { handleAdminRoutes, handleTelegramAdminWebhook } from './adminService';
import { ensureSchema } from './db';

export interface Env {
  ENVIRONMENT?: string;
  AGENTIC_ADMIN_TOKEN?: string;
  ALLOWED_GOOGLE_DOMAIN?: string;
  ADMIN_EMAIL_ALLOWLIST?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ADMIN_CHAT_IDS?: string;
  AGENT_DB: D1Database;
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
} satisfies ExportedHandler<Env>;
