import { createAgentContext, createRequestId, logEvent } from './lib';
import { evaluateSafetyPolicy, sanitizeAuditEvent } from './policies';
import type { EnvironmentName } from './contracts';
import { runWorkflow } from './workflows';
import { ADMIN_HTML } from './adminHtml';
import { getAdminAuth } from './auth';
import {
  ensureSchema,
  insertChatMessage,
  insertLog,
  insertRun,
  listChatMessages,
  listLogs,
  listRuns,
  updateRunStatus,
} from './db';
import { generateAgentChatReply } from './chat';
import type { TelegramUpdate } from './telegram';
import { sendTelegramMessage } from './telegram';

export interface Env {
  ENVIRONMENT?: string;
  AGENTIC_ADMIN_TOKEN?: string;
  ALLOWED_GOOGLE_DOMAIN?: string;
  ADMIN_EMAIL_ALLOWLIST?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  AGENT_DB: D1Database;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function html(content: string): Response {
  return new Response(content, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    await ensureSchema(env.AGENT_DB);

    if (url.pathname === '/health') {
      return json({ ok: true, status: 'healthy', service: 'bitecode-agentic-orchestrator' });
    }

    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      const auth = getAdminAuth(request, {
        fallbackToken: env.AGENTIC_ADMIN_TOKEN,
        allowedGoogleDomain: env.ALLOWED_GOOGLE_DOMAIN ?? 'gmail.com',
        allowlistCsv: env.ADMIN_EMAIL_ALLOWLIST,
      });

      if (!auth.authenticated) {
        return json({ ok: false, error: auth.reason ?? 'Unauthorized' }, 401);
      }

      return html(ADMIN_HTML);
    }

    if (url.pathname === '/api/admin/me') {
      const auth = getAdminAuth(request, {
        fallbackToken: env.AGENTIC_ADMIN_TOKEN,
        allowedGoogleDomain: env.ALLOWED_GOOGLE_DOMAIN ?? 'gmail.com',
        allowlistCsv: env.ADMIN_EMAIL_ALLOWLIST,
      });

      if (!auth.authenticated) {
        return json({ ok: false, error: auth.reason ?? 'Unauthorized' }, 401);
      }

      return json({ ok: true, email: auth.email });
    }

    if (url.pathname === '/api/admin/jobs') {
      const auth = getAdminAuth(request, {
        fallbackToken: env.AGENTIC_ADMIN_TOKEN,
        allowedGoogleDomain: env.ALLOWED_GOOGLE_DOMAIN ?? 'gmail.com',
        allowlistCsv: env.ADMIN_EMAIL_ALLOWLIST,
      });

      if (!auth.authenticated) {
        return json({ ok: false, error: auth.reason ?? 'Unauthorized' }, 401);
      }

      const runs = await listRuns(env.AGENT_DB, 50);
      return json({ ok: true, runs });
    }

    if (url.pathname === '/api/admin/logs') {
      const auth = getAdminAuth(request, {
        fallbackToken: env.AGENTIC_ADMIN_TOKEN,
        allowedGoogleDomain: env.ALLOWED_GOOGLE_DOMAIN ?? 'gmail.com',
        allowlistCsv: env.ADMIN_EMAIL_ALLOWLIST,
      });

      if (!auth.authenticated) {
        return json({ ok: false, error: auth.reason ?? 'Unauthorized' }, 401);
      }

      const runId = url.searchParams.get('runId') ?? undefined;
      const logs = await listLogs(env.AGENT_DB, runId, 200);
      return json({ ok: true, logs });
    }

    if (url.pathname === '/api/admin/chat') {
      const auth = getAdminAuth(request, {
        fallbackToken: env.AGENTIC_ADMIN_TOKEN,
        allowedGoogleDomain: env.ALLOWED_GOOGLE_DOMAIN ?? 'gmail.com',
        allowlistCsv: env.ADMIN_EMAIL_ALLOWLIST,
      });

      if (!auth.authenticated) {
        return json({ ok: false, error: auth.reason ?? 'Unauthorized' }, 401);
      }

      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const body = (await request.json().catch(() => ({}))) as { message?: string };
      const message = (body.message ?? '').trim();
      const reply = generateAgentChatReply(message);
      const now = new Date().toISOString();
      const chatId = createRequestId('chat-web');

      await insertChatMessage(env.AGENT_DB, {
        id: chatId,
        channel: 'web',
        actor: auth.email ?? 'web-admin',
        message,
        response: reply.response,
        createdAt: now,
      });

      const messages = await listChatMessages(env.AGENT_DB, 20);
      return json({ ok: true, response: reply.response, tags: reply.tags, messages });
    }

    if (url.pathname === `/api/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET ?? '__missing__'}`) {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
      const messageText = update.message?.text?.trim() ?? '';
      const chatId = update.message?.chat?.id;

      if (!chatId) {
        return json({ ok: true, ignored: true, reason: 'No chat id in update' });
      }

      const reply = generateAgentChatReply(messageText);
      const now = new Date().toISOString();
      const msgId = createRequestId('chat-telegram');

      await insertChatMessage(env.AGENT_DB, {
        id: msgId,
        channel: 'telegram',
        actor: `telegram:${chatId}`,
        message: messageText,
        response: reply.response,
        createdAt: now,
      });

      if (env.TELEGRAM_BOT_TOKEN) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, reply.response);
      }

      return json({ ok: true, messageId: msgId });
    }

    if (url.pathname === '/admin/run-weekly-review') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const auth = request.headers.get('x-admin-token') ?? '';
      if (auth !== env.AGENTIC_ADMIN_TOKEN) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }

      const requestId = createRequestId(url.pathname);
      const actor = request.headers.get('x-actor') ?? 'admin';
      const environment: EnvironmentName =
        env.ENVIRONMENT === 'production' || env.ENVIRONMENT === 'test'
          ? (env.ENVIRONMENT as EnvironmentName)
          : 'development';

      const context = createAgentContext({
        requestId,
        actor,
        environment,
        policy: { allowExternalToolCalls: false, requireApproval: true },
      });

      const orchestrationRequest = {
        source: 'cloudflare-worker',
        intent: 'weekly-review',
        payload: { initiatedBy: actor },
        allowExternalCalls: false,
      };

      const policyDecision = evaluateSafetyPolicy(orchestrationRequest, context);
      const sanitizedAudit = sanitizeAuditEvent({ requestId, actor, allowed: policyDecision.allowed, reason: policyDecision.reason });

      const runId = createRequestId('run');
      const now = new Date().toISOString();

      await insertRun(env.AGENT_DB, {
        id: runId,
        requestId,
        runType: 'weekly-review',
        status: 'started',
        summary: 'Weekly review started',
        startedAt: now,
      });

      await insertLog(env.AGENT_DB, {
        id: createRequestId('log'),
        runId,
        level: 'info',
        message: 'Weekly review requested',
        createdAt: now,
      });

      logEvent('weekly review requested', { requestId, allowed: policyDecision.allowed });

      if (!policyDecision.allowed) {
        await updateRunStatus(env.AGENT_DB, runId, 'blocked', 'Blocked by policy', new Date().toISOString());
        await insertLog(env.AGENT_DB, {
          id: createRequestId('log'),
          runId,
          level: 'warn',
          message: 'Weekly review blocked by policy',
          createdAt: new Date().toISOString(),
        });
        return json({ ok: false, requestId, runId, policy: policyDecision, audit: sanitizedAudit }, 403);
      }

      const result = await runWorkflow(orchestrationRequest, context);
      await updateRunStatus(env.AGENT_DB, runId, result.status, result.summary, new Date().toISOString());
      await insertLog(env.AGENT_DB, {
        id: createRequestId('log'),
        runId,
        level: 'info',
        message: `Weekly review completed with status ${result.status}`,
        createdAt: new Date().toISOString(),
      });

      return json({ ok: true, requestId, runId, status: 'accepted', result, audit: sanitizedAudit }, 200);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
