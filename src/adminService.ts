import { getAdminAuth } from './auth';
import { ADMIN_WEBAPP_HTML } from './adminWebApp';
import { createRequestId } from './lib';
import {
  ensureAdminSchema,
  hasTelegramUpdateBeenProcessed,
  insertAdminAuditLog,
  insertAdminChatMessage,
  insertAdminCommand,
  listAdminAuditLogs,
  listAdminChatMessages,
  listAdminCommands,
  listAdminUsers,
  markTelegramUpdateProcessed,
  recordAdminSession,
  updateAdminCommandStatus,
  upsertAdminUserOnLogin,
} from './adminDb';
import { generateAgentChatReply } from './chat';
import { listLogs, listRuns } from './db';
import type { TelegramUpdate } from './telegram';
import { sendTelegramMessage } from './telegram';
import { runWeeklyReview } from './agentService';

export interface AdminServiceEnv {
  AGENTIC_ADMIN_TOKEN?: string;
  ALLOWED_GOOGLE_DOMAIN?: string;
  ADMIN_EMAIL_ALLOWLIST?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ADMIN_CHAT_IDS?: string;
  ENVIRONMENT?: string;
  AGENT_DB: D1Database;
  ADMIN_DB: D1Database;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function html(content: string): Response {
  return new Response(content, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

async function requireAdmin(request: Request, env: AdminServiceEnv): Promise<{ ok: true; email: string } | { ok: false; response: Response }> {
  const auth = getAdminAuth(request, {
    fallbackToken: env.AGENTIC_ADMIN_TOKEN,
    allowedGoogleDomain: env.ALLOWED_GOOGLE_DOMAIN ?? 'gmail.com',
    allowlistCsv: env.ADMIN_EMAIL_ALLOWLIST,
  });

  if (!auth.authenticated) {
    return { ok: false, response: json({ ok: false, error: auth.reason ?? 'Unauthorized' }, 401) };
  }

  const email = auth.email ?? 'unknown@gmail.com';
  await upsertAdminUserOnLogin(env.ADMIN_DB, email, email.split('@')[0] ?? email, 'google');
  await recordAdminSession(env.ADMIN_DB, email, auth.email === 'token-auth@local' ? 'token' : 'cloudflare-access');

  return { ok: true, email };
}

function parseAllowedTelegramChatIds(csv?: string): Set<string> {
  const values = (csv ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return new Set(values);
}

export async function handleAdminRoutes(request: Request, env: AdminServiceEnv): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/admin') && !url.pathname.startsWith('/api/admin/v1')) {
    return null;
  }

  await ensureAdminSchema(env.ADMIN_DB);

  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    return html(ADMIN_WEBAPP_HTML);
  }

  if (url.pathname === '/api/admin/v1/me') {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    return json({ ok: true, email: auth.email });
  }

  if (url.pathname === '/api/admin/v1/jobs') {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const runs = await listRuns(env.AGENT_DB, 100);
    return json({ ok: true, runs });
  }

  if (url.pathname === '/api/admin/v1/logs') {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const runId = url.searchParams.get('runId') ?? undefined;
    const logs = await listLogs(env.AGENT_DB, runId, 200);
    return json({ ok: true, logs });
  }

  if (url.pathname === '/api/admin/v1/users') {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const users = await listAdminUsers(env.ADMIN_DB, 200);
    return json({ ok: true, users });
  }

  if (url.pathname === '/api/admin/v1/audit') {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const logs = await listAdminAuditLogs(env.ADMIN_DB, 200);
    return json({ ok: true, logs });
  }

  if (url.pathname === '/api/admin/v1/commands' && request.method === 'GET') {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const commands = await listAdminCommands(env.ADMIN_DB, 200);
    return json({ ok: true, commands });
  }

  if (url.pathname === '/api/admin/v1/commands' && request.method === 'POST') {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await request.json().catch(() => ({}))) as {
      commandType?: string;
      payload?: unknown;
    };

    const commandType = (body.commandType ?? '').trim();
    if (!commandType) {
      return json({ ok: false, error: 'commandType is required' }, 400);
    }

    const commandId = await insertAdminCommand(env.ADMIN_DB, {
      actorEmail: auth.email,
      commandType,
      payloadJson: JSON.stringify(body.payload ?? {}),
      status: 'received',
      linkedAgentRunId: undefined,
    });

    await insertAdminAuditLog(env.ADMIN_DB, {
      actorEmail: auth.email,
      action: 'admin.command.created',
      targetType: 'admin_agent_commands',
      targetId: commandId,
      metadataJson: JSON.stringify({ commandType }),
    });

    if (commandType === 'weekly.review') {
      const run = await runWeeklyReview(env, auth.email);
      await updateAdminCommandStatus(env.ADMIN_DB, commandId, run.status, run.runId);

      await insertAdminAuditLog(env.ADMIN_DB, {
        actorEmail: auth.email,
        action: 'admin.command.executed',
        targetType: 'agent_run',
        targetId: run.runId,
        metadataJson: JSON.stringify({ commandId, commandType, status: run.status }),
      });

      return json({ ok: true, commandId, execution: run });
    }

    await updateAdminCommandStatus(env.ADMIN_DB, commandId, 'queued');
    return json({ ok: true, commandId, status: 'queued', note: 'Command accepted and queued for future handlers.' });
  }

  if (url.pathname === '/api/admin/v1/chat' && request.method === 'POST') {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await request.json().catch(() => ({}))) as { message?: string };
    const message = (body.message ?? '').trim();
    if (!message) {
      return json({ ok: false, error: 'message is required' }, 400);
    }

    const reply = generateAgentChatReply(message);

    await insertAdminChatMessage(env.ADMIN_DB, {
      channel: 'web',
      actorEmail: auth.email,
      message,
      response: reply.response,
    });

    await insertAdminAuditLog(env.ADMIN_DB, {
      actorEmail: auth.email,
      action: 'admin.chat.sent',
      targetType: 'admin_chat_messages',
      targetId: undefined,
      metadataJson: JSON.stringify({ tags: reply.tags }),
    });

    const messages = await listAdminChatMessages(env.ADMIN_DB, 50);
    return json({ ok: true, response: reply.response, tags: reply.tags, messages });
  }

  if (url.pathname.startsWith('/api/admin/v1')) {
    return new Response('Not found', { status: 404 });
  }

  return null;
}

export async function handleTelegramAdminWebhook(request: Request, env: AdminServiceEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const secret = env.TELEGRAM_WEBHOOK_SECRET ?? '__missing__';
  if (url.pathname !== `/api/telegram/webhook/${secret}`) {
    return null;
  }

  await ensureAdminSchema(env.ADMIN_DB);

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
  const updateId = update.update_id;
  const messageText = update.message?.text?.trim() ?? '';
  const chatId = update.message?.chat?.id;
  const messageId = update.message?.message_id;

  if (!chatId) {
    return json({ ok: true, ignored: true, reason: 'No chat id in update' });
  }

  if (typeof updateId === 'number') {
    const processed = await hasTelegramUpdateBeenProcessed(env.ADMIN_DB, updateId);
    if (processed) {
      return json({ ok: true, ignored: true, reason: 'Duplicate update ignored' });
    }
    await markTelegramUpdateProcessed(env.ADMIN_DB, updateId, String(chatId), messageId);
  }

  const allowedChatIds = parseAllowedTelegramChatIds(env.TELEGRAM_ADMIN_CHAT_IDS);
  if (allowedChatIds.size > 0 && !allowedChatIds.has(String(chatId))) {
    await insertAdminAuditLog(env.ADMIN_DB, {
      actorEmail: `telegram:${chatId}`,
      action: 'telegram.rejected',
      targetType: 'telegram_chat',
      targetId: String(chatId),
      metadataJson: JSON.stringify({ reason: 'chat id not allowlisted' }),
    });

    return json({ ok: false, error: 'Chat ID not allowed' }, 403);
  }

  const reply = generateAgentChatReply(messageText);

  await insertAdminChatMessage(env.ADMIN_DB, {
    channel: 'telegram',
    actorEmail: `telegram:${chatId}`,
    message: messageText,
    response: reply.response,
  });

  await insertAdminAuditLog(env.ADMIN_DB, {
    actorEmail: `telegram:${chatId}`,
    action: 'telegram.chat.received',
    targetType: 'admin_chat_messages',
    targetId: createRequestId('telegram-chat-event'),
    metadataJson: JSON.stringify({ tags: reply.tags }),
  });

  if (env.TELEGRAM_BOT_TOKEN) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, reply.response);
  }

  return json({ ok: true });
}
