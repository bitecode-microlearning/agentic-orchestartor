var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/lib.ts
function createRequestId(pathname) {
  const prefix = pathname.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").slice(0, 16) || "request";
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
__name(createRequestId, "createRequestId");
function createAgentContext(input) {
  return {
    requestId: input.requestId,
    actor: input.actor,
    environment: input.environment ?? "development",
    policy: input.policy
  };
}
__name(createAgentContext, "createAgentContext");
function logEvent(message, details) {
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  console.info(`[agentic-orchestrator] ${message}${payload}`);
}
__name(logEvent, "logEvent");

// src/policies.ts
var SENSITIVE_KEYS = ["secret", "token", "password", "apikey", "authorization"];
function evaluateSafetyPolicy(request, _context) {
  const candidate = JSON.stringify(request.payload ?? {});
  const containsSensitiveData = SENSITIVE_KEYS.some((key) => candidate.toLowerCase().includes(key));
  const allow = !containsSensitiveData && !request.allowExternalCalls;
  return {
    allowed: allow,
    reason: allow ? "Safe placeholder request accepted." : "Blocked because the request appears to include sensitive data or external execution.",
    redactedInput: redactSensitivePayload(request.payload ?? {})
  };
}
__name(evaluateSafetyPolicy, "evaluateSafetyPolicy");
function sanitizeAuditEvent(event) {
  return Object.fromEntries(
    Object.entries(event).map(([key, value]) => [key, typeof value === "string" ? redactString(value) : value])
  );
}
__name(sanitizeAuditEvent, "sanitizeAuditEvent");
function redactSensitivePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, shouldRedact(key) ? "[redacted]" : value])
  );
}
__name(redactSensitivePayload, "redactSensitivePayload");
function shouldRedact(key) {
  return SENSITIVE_KEYS.some((candidate) => key.toLowerCase().includes(candidate));
}
__name(shouldRedact, "shouldRedact");
function redactString(value) {
  return value.replace(/(token|secret|password|apikey|authorization)=([^&\s]+)/gi, "$1=[redacted]");
}
__name(redactString, "redactString");

// src/workflows.ts
async function runWorkflow(request, context) {
  return {
    requestId: context.requestId,
    status: "completed",
    summary: `workflow ${request.intent} placeholder completed`,
    agents: [{ name: "BiteCodeOrchestrator", status: "completed", summary: "placeholder" }],
    evidence: [
      {
        source: "orchestrator",
        note: "This is an initial non-destructive placeholder workflow result."
      }
    ]
  };
}
__name(runWorkflow, "runWorkflow");

// src/db.ts
async function ensureSchema(db) {
  await db.exec(createSchemaSql());
}
__name(ensureSchema, "ensureSchema");
function createSchemaSql() {
  return [
    "CREATE TABLE IF NOT EXISTS workflow_runs (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, run_type TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT);",
    "CREATE TABLE IF NOT EXISTS run_logs (id TEXT PRIMARY KEY, run_id TEXT, level TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL);",
    "CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, channel TEXT NOT NULL, actor TEXT NOT NULL, message TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL);"
  ].join("\n");
}
__name(createSchemaSql, "createSchemaSql");
async function insertRun(db, run) {
  await db.prepare(
    "INSERT INTO workflow_runs (id, request_id, run_type, status, summary, started_at, finished_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
  ).bind(run.id, run.requestId, run.runType, run.status, run.summary, run.startedAt, run.finishedAt ?? null).run();
}
__name(insertRun, "insertRun");
async function updateRunStatus(db, runId, status2, summary, finishedAt) {
  await db.prepare("UPDATE workflow_runs SET status = ?1, summary = ?2, finished_at = ?3 WHERE id = ?4").bind(status2, summary, finishedAt, runId).run();
}
__name(updateRunStatus, "updateRunStatus");
async function listRuns(db, limit = 50) {
  const result = await db.prepare(
    "SELECT id, request_id as requestId, run_type as runType, status, summary, started_at as startedAt, finished_at as finishedAt FROM workflow_runs ORDER BY started_at DESC LIMIT ?1"
  ).bind(limit).all();
  return result.results ?? [];
}
__name(listRuns, "listRuns");
async function insertLog(db, log) {
  await db.prepare("INSERT INTO run_logs (id, run_id, level, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(log.id, log.runId ?? null, log.level, log.message, log.createdAt).run();
}
__name(insertLog, "insertLog");
async function listLogs(db, runId, limit = 200) {
  if (runId) {
    const scoped = await db.prepare(
      "SELECT id, run_id as runId, level, message, created_at as createdAt FROM run_logs WHERE run_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    ).bind(runId, limit).all();
    return scoped.results ?? [];
  }
  const result = await db.prepare(
    "SELECT id, run_id as runId, level, message, created_at as createdAt FROM run_logs ORDER BY created_at DESC LIMIT ?1"
  ).bind(limit).all();
  return result.results ?? [];
}
__name(listLogs, "listLogs");

// src/agentService.ts
async function runWeeklyReview(env, actor) {
  const requestId = createRequestId("admin-run-weekly-review");
  const environment = env.ENVIRONMENT === "production" || env.ENVIRONMENT === "test" ? env.ENVIRONMENT : "development";
  const context = createAgentContext({
    requestId,
    actor,
    environment,
    policy: { allowExternalToolCalls: false, requireApproval: true }
  });
  const orchestrationRequest = {
    source: "cloudflare-worker",
    intent: "weekly-review",
    payload: { initiatedBy: actor },
    allowExternalCalls: false
  };
  const policyDecision = evaluateSafetyPolicy(orchestrationRequest, context);
  const sanitizedAudit = sanitizeAuditEvent({ requestId, actor, allowed: policyDecision.allowed, reason: policyDecision.reason });
  const runId = createRequestId("run");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await insertRun(env.AGENT_DB, {
    id: runId,
    requestId,
    runType: "weekly-review",
    status: "started",
    summary: "Weekly review started",
    startedAt: now
  });
  await insertLog(env.AGENT_DB, {
    id: createRequestId("log"),
    runId,
    level: "info",
    message: `Weekly review requested by ${actor}`,
    createdAt: now
  });
  logEvent("weekly review requested", { requestId, allowed: policyDecision.allowed, actor });
  if (!policyDecision.allowed) {
    await updateRunStatus(env.AGENT_DB, runId, "blocked", "Blocked by policy", (/* @__PURE__ */ new Date()).toISOString());
    await insertLog(env.AGENT_DB, {
      id: createRequestId("log"),
      runId,
      level: "warn",
      message: "Weekly review blocked by policy",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return {
      ok: false,
      requestId,
      runId,
      status: "blocked",
      policy: policyDecision,
      audit: sanitizedAudit
    };
  }
  const result = await runWorkflow(orchestrationRequest, context);
  await updateRunStatus(env.AGENT_DB, runId, result.status, result.summary, (/* @__PURE__ */ new Date()).toISOString());
  await insertLog(env.AGENT_DB, {
    id: createRequestId("log"),
    runId,
    level: "info",
    message: `Weekly review completed with status ${result.status}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  return {
    ok: true,
    requestId,
    runId,
    status: "accepted",
    result,
    audit: sanitizedAudit
  };
}
__name(runWeeklyReview, "runWeeklyReview");

// src/auth.ts
function getAdminAuth(request, options) {
  const accessEmail = request.headers.get("cf-access-authenticated-user-email") ?? void 0;
  const adminTokenHeader = request.headers.get("x-admin-token") ?? "";
  if (options.fallbackToken && adminTokenHeader && adminTokenHeader === options.fallbackToken) {
    return { authenticated: true, email: "token-auth@local" };
  }
  if (!accessEmail) {
    return { authenticated: false, reason: "Missing Cloudflare Access identity" };
  }
  const allowedDomain = (options.allowedGoogleDomain ?? "gmail.com").toLowerCase();
  const allowlist = (options.allowlistCsv ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const normalizedEmail = accessEmail.trim().toLowerCase();
  const inDomain = normalizedEmail.endsWith(`@${allowedDomain}`);
  const inAllowlist = allowlist.length > 0 ? allowlist.includes(normalizedEmail) : true;
  if (!inDomain) {
    return { authenticated: false, reason: `Only @${allowedDomain} accounts are allowed` };
  }
  if (!inAllowlist) {
    return { authenticated: false, reason: "Email not in admin allowlist" };
  }
  return { authenticated: true, email: normalizedEmail };
}
__name(getAdminAuth, "getAdminAuth");

// src/adminWebApp.ts
var ADMIN_WEBAPP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BiteCode Admin Control</title>
  <style>
    :root {
      --bg: #0a0f1e;
      --card: #10172b;
      --card2: #0e1629;
      --text: #e6edf7;
      --muted: #9fb0cb;
      --line: #24324f;
      --accent: #22c55e;
      --warn: #f59e0b;
      --bad: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      color: var(--text);
      background: radial-gradient(1200px 700px at 8% -20%, #1f3259 0%, transparent 60%), var(--bg);
    }
    .container { max-width: 1180px; margin: 0 auto; padding: 20px; }
    .top {
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
      background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px;
    }
    h1 { margin: 0; font-size: 20px; }
    .muted { color: var(--muted); font-size: 13px; }
    .grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px;
    }
    @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
    .panel {
      background: linear-gradient(180deg, var(--card), var(--card2));
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      min-height: 220px;
    }
    .panel h2 { margin: 0 0 10px 0; font-size: 16px; }
    .row { display: flex; gap: 8px; }
    .row > * { flex: 1; }
    input, textarea, select, button {
      width: 100%; border: 1px solid var(--line); border-radius: 10px;
      background: #0b1222; color: var(--text); padding: 9px 10px;
    }
    textarea { min-height: 90px; resize: vertical; }
    button {
      cursor: pointer;
      background: #14532d;
      border-color: #166534;
      font-weight: 600;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid var(--line); text-align: left; padding: 7px; }
    code { color: #b7f0cc; }
    pre {
      margin: 0; background: #050a14; border: 1px solid var(--line);
      border-radius: 10px; padding: 10px; overflow: auto; max-height: 320px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="top">
      <div>
        <h1>BiteCode Admin Control App</h1>
        <div class="muted">Separate admin control plane. Admin DB is isolated from agent workflows.</div>
      </div>
      <div id="identity" class="muted">Checking login\u2026</div>
    </div>

    <div class="grid">
      <section class="panel">
        <h2>Admin Commands</h2>
        <div class="row">
          <select id="cmd-type">
            <option value="weekly.review">weekly.review</option>
            <option value="agent.plan">agent.plan</option>
            <option value="agent.investigate">agent.investigate</option>
          </select>
        </div>
        <textarea id="cmd-payload" placeholder='{"note":"run weekly review"}'></textarea>
        <button id="send-command">Send Command</button>
        <pre id="cmd-result">[]</pre>
      </section>

      <section class="panel">
        <h2>Admin Chat</h2>
        <textarea id="chat-message" placeholder="Discuss with the agent..."></textarea>
        <button id="send-chat">Send Chat</button>
        <pre id="chat-result">[]</pre>
      </section>

      <section class="panel">
        <h2>Agent Jobs</h2>
        <table id="jobs-table">
          <thead><tr><th>Run ID</th><th>Status</th><th>Summary</th><th>Started</th></tr></thead>
          <tbody></tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Agent Logs</h2>
        <input id="run-id" placeholder="run id (optional)" />
        <button id="load-logs">Load Logs</button>
        <pre id="logs-result">[]</pre>
      </section>

      <section class="panel">
        <h2>Admin Users</h2>
        <pre id="users-result">[]</pre>
      </section>

      <section class="panel">
        <h2>Admin Audit</h2>
        <pre id="audit-result">[]</pre>
      </section>
    </div>
  </div>

  <script>
    async function api(url, options) {
      const res = await fetch(url, options);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
      return body;
    }

    async function refreshIdentity() {
      const me = await api('/api/admin/v1/me');
      document.getElementById('identity').textContent = 'Signed in as ' + me.email;
    }

    async function refreshJobs() {
      const data = await api('/api/admin/v1/jobs');
      const tbody = document.querySelector('#jobs-table tbody');
      tbody.innerHTML = '';
      for (const run of (data.runs || [])) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + run.id + '</td><td>' + run.status + '</td><td>' + (run.summary || '') + '</td><td>' + (run.startedAt || '') + '</td>';
        tbody.appendChild(tr);
      }
    }

    async function refreshAdminUsers() {
      const data = await api('/api/admin/v1/users');
      document.getElementById('users-result').textContent = JSON.stringify(data.users || [], null, 2);
    }

    async function refreshAudit() {
      const data = await api('/api/admin/v1/audit');
      document.getElementById('audit-result').textContent = JSON.stringify(data.logs || [], null, 2);
    }

    async function loadLogs() {
      const runId = document.getElementById('run-id').value.trim();
      const q = runId ? ('?runId=' + encodeURIComponent(runId)) : '';
      const data = await api('/api/admin/v1/logs' + q);
      document.getElementById('logs-result').textContent = JSON.stringify(data.logs || [], null, 2);
    }

    async function sendCommand() {
      const commandType = document.getElementById('cmd-type').value;
      const raw = document.getElementById('cmd-payload').value.trim() || '{}';
      let payload = {};
      try { payload = JSON.parse(raw); } catch { throw new Error('Invalid JSON payload'); }
      const data = await api('/api/admin/v1/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commandType, payload })
      });
      document.getElementById('cmd-result').textContent = JSON.stringify(data, null, 2);
      await refreshJobs();
      await refreshAudit();
    }

    async function sendChat() {
      const message = document.getElementById('chat-message').value.trim();
      const data = await api('/api/admin/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message })
      });
      document.getElementById('chat-result').textContent = JSON.stringify(data, null, 2);
      await refreshAudit();
    }

    document.getElementById('load-logs').addEventListener('click', () => loadLogs().catch(err => alert(err.message)));
    document.getElementById('send-command').addEventListener('click', () => sendCommand().catch(err => alert(err.message)));
    document.getElementById('send-chat').addEventListener('click', () => sendChat().catch(err => alert(err.message)));

    Promise.all([
      refreshIdentity(),
      refreshJobs(),
      refreshAdminUsers(),
      refreshAudit(),
      loadLogs(),
    ]).catch(err => {
      document.getElementById('identity').textContent = 'Auth/setup error: ' + err.message;
    });
  <\/script>
</body>
</html>`;

// src/adminDb.ts
function createAdminSchemaSql() {
  return [
    "CREATE TABLE IF NOT EXISTS admin_users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, idp_provider TEXT NOT NULL, role TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT);",
    "CREATE TABLE IF NOT EXISTS admin_sessions (id TEXT PRIMARY KEY, user_email TEXT NOT NULL, auth_type TEXT NOT NULL, idp_subject TEXT, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);",
    "CREATE TABLE IF NOT EXISTS admin_audit_logs (id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT, metadata_json TEXT, created_at TEXT NOT NULL);",
    "CREATE TABLE IF NOT EXISTS admin_agent_commands (id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, command_type TEXT NOT NULL, payload_json TEXT, status TEXT NOT NULL, linked_agent_run_id TEXT, created_at TEXT NOT NULL);",
    "CREATE TABLE IF NOT EXISTS admin_chat_messages (id TEXT PRIMARY KEY, channel TEXT NOT NULL, actor_email TEXT NOT NULL, message TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL);",
    "CREATE TABLE IF NOT EXISTS telegram_webhook_events (update_id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL, message_id INTEGER, created_at TEXT NOT NULL);"
  ].join("\n");
}
__name(createAdminSchemaSql, "createAdminSchemaSql");
async function ensureAdminSchema(db) {
  await db.exec(createAdminSchemaSql());
}
__name(ensureAdminSchema, "ensureAdminSchema");
async function upsertAdminUserOnLogin(db, email, displayName, idpProvider = "google") {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.prepare(
    "INSERT INTO admin_users (id, email, display_name, idp_provider, role, is_active, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6) ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, idp_provider = excluded.idp_provider, last_login_at = excluded.last_login_at"
  ).bind(createRequestId("admin-user"), email, displayName, idpProvider, "admin", now).run();
}
__name(upsertAdminUserOnLogin, "upsertAdminUserOnLogin");
async function recordAdminSession(db, userEmail, authType, idpSubject) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.prepare(
    "INSERT INTO admin_sessions (id, user_email, auth_type, idp_subject, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)"
  ).bind(createRequestId("admin-session"), userEmail, authType, idpSubject ?? null, now).run();
}
__name(recordAdminSession, "recordAdminSession");
async function insertAdminAuditLog(db, input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.prepare(
    "INSERT INTO admin_audit_logs (id, actor_email, action, target_type, target_id, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
  ).bind(
    createRequestId("admin-audit"),
    input.actorEmail,
    input.action,
    input.targetType,
    input.targetId ?? null,
    input.metadataJson ?? null,
    now
  ).run();
}
__name(insertAdminAuditLog, "insertAdminAuditLog");
async function insertAdminCommand(db, input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = createRequestId("admin-cmd");
  await db.prepare(
    "INSERT INTO admin_agent_commands (id, actor_email, command_type, payload_json, status, linked_agent_run_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
  ).bind(id, input.actorEmail, input.commandType, input.payloadJson ?? null, input.status, input.linkedAgentRunId ?? null, now).run();
  return id;
}
__name(insertAdminCommand, "insertAdminCommand");
async function updateAdminCommandStatus(db, commandId, status2, linkedAgentRunId) {
  await db.prepare("UPDATE admin_agent_commands SET status = ?1, linked_agent_run_id = ?2 WHERE id = ?3").bind(status2, linkedAgentRunId ?? null, commandId).run();
}
__name(updateAdminCommandStatus, "updateAdminCommandStatus");
async function insertAdminChatMessage(db, chat) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.prepare(
    "INSERT INTO admin_chat_messages (id, channel, actor_email, message, response, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  ).bind(createRequestId("admin-chat"), chat.channel, chat.actorEmail, chat.message, chat.response, now).run();
}
__name(insertAdminChatMessage, "insertAdminChatMessage");
async function listAdminUsers(db, limit = 200) {
  const result = await db.prepare(
    "SELECT id, email, display_name as displayName, idp_provider as idpProvider, role, is_active as isActive, created_at as createdAt, last_login_at as lastLoginAt FROM admin_users ORDER BY created_at DESC LIMIT ?1"
  ).bind(limit).all();
  return result.results ?? [];
}
__name(listAdminUsers, "listAdminUsers");
async function listAdminAuditLogs(db, limit = 200) {
  const result = await db.prepare(
    "SELECT id, actor_email as actorEmail, action, target_type as targetType, target_id as targetId, metadata_json as metadataJson, created_at as createdAt FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?1"
  ).bind(limit).all();
  return result.results ?? [];
}
__name(listAdminAuditLogs, "listAdminAuditLogs");
async function listAdminCommands(db, limit = 200) {
  const result = await db.prepare(
    "SELECT id, actor_email as actorEmail, command_type as commandType, payload_json as payloadJson, status, linked_agent_run_id as linkedAgentRunId, created_at as createdAt FROM admin_agent_commands ORDER BY created_at DESC LIMIT ?1"
  ).bind(limit).all();
  return result.results ?? [];
}
__name(listAdminCommands, "listAdminCommands");
async function listAdminChatMessages(db, limit = 200) {
  const result = await db.prepare(
    "SELECT id, channel, actor_email as actorEmail, message, response, created_at as createdAt FROM admin_chat_messages ORDER BY created_at DESC LIMIT ?1"
  ).bind(limit).all();
  return result.results ?? [];
}
__name(listAdminChatMessages, "listAdminChatMessages");
async function hasTelegramUpdateBeenProcessed(db, updateId) {
  const result = await db.prepare("SELECT update_id as updateId FROM telegram_webhook_events WHERE update_id = ?1 LIMIT 1").bind(updateId).first();
  return Boolean(result);
}
__name(hasTelegramUpdateBeenProcessed, "hasTelegramUpdateBeenProcessed");
async function markTelegramUpdateProcessed(db, updateId, chatId, messageId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.prepare("INSERT OR IGNORE INTO telegram_webhook_events (update_id, chat_id, message_id, created_at) VALUES (?1, ?2, ?3, ?4)").bind(updateId, chatId, messageId ?? null, now).run();
}
__name(markTelegramUpdateProcessed, "markTelegramUpdateProcessed");

// src/chat.ts
function generateAgentChatReply(message) {
  const trimmed = message.trim();
  if (!trimmed) {
    return {
      response: "Please provide a message so I can help with BiteCode operations.",
      tags: ["input.required"]
    };
  }
  const intentHint = trimmed.length > 100 ? "long-form request" : trimmed.toLowerCase().includes("weekly") ? "weekly review request" : trimmed.toLowerCase().includes("jira") ? "jira planning request" : trimmed.toLowerCase().includes("log") ? "log investigation request" : "general admin request";
  return {
    response: `Got it. I identified this as a ${intentHint}.

I can help summarize current orchestrator state, suggest Jira tasks, and draft Confluence updates. Destructive actions still require explicit human approval.`,
    tags: ["chat.reply", "approval.first"]
  };
}
__name(generateAgentChatReply, "generateAgentChatReply");

// src/telegram.ts
async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
__name(sendTelegramMessage, "sendTelegramMessage");

// src/adminService.ts
function json(data, status2 = 200) {
  return new Response(JSON.stringify(data), {
    status: status2,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
function html(content) {
  return new Response(content, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}
__name(html, "html");
async function requireAdmin(request, env) {
  const auth = getAdminAuth(request, {
    fallbackToken: env.AGENTIC_ADMIN_TOKEN,
    allowedGoogleDomain: env.ALLOWED_GOOGLE_DOMAIN ?? "gmail.com",
    allowlistCsv: env.ADMIN_EMAIL_ALLOWLIST
  });
  if (!auth.authenticated) {
    return { ok: false, response: json({ ok: false, error: auth.reason ?? "Unauthorized" }, 401) };
  }
  const email = auth.email ?? "unknown@gmail.com";
  await upsertAdminUserOnLogin(env.ADMIN_DB, email, email.split("@")[0] ?? email, "google");
  await recordAdminSession(env.ADMIN_DB, email, auth.email === "token-auth@local" ? "token" : "cloudflare-access");
  return { ok: true, email };
}
__name(requireAdmin, "requireAdmin");
function parseAllowedTelegramChatIds(csv) {
  const values = (csv ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return new Set(values);
}
__name(parseAllowedTelegramChatIds, "parseAllowedTelegramChatIds");
async function handleAdminRoutes(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/admin") && !url.pathname.startsWith("/api/admin/v1")) {
    return null;
  }
  await ensureAdminSchema(env.ADMIN_DB);
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    return html(ADMIN_WEBAPP_HTML);
  }
  if (url.pathname === "/api/admin/v1/me") {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    return json({ ok: true, email: auth.email });
  }
  if (url.pathname === "/api/admin/v1/jobs") {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    const runs = await listRuns(env.AGENT_DB, 100);
    return json({ ok: true, runs });
  }
  if (url.pathname === "/api/admin/v1/logs") {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    const runId = url.searchParams.get("runId") ?? void 0;
    const logs = await listLogs(env.AGENT_DB, runId, 200);
    return json({ ok: true, logs });
  }
  if (url.pathname === "/api/admin/v1/users") {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    const users = await listAdminUsers(env.ADMIN_DB, 200);
    return json({ ok: true, users });
  }
  if (url.pathname === "/api/admin/v1/audit") {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    const logs = await listAdminAuditLogs(env.ADMIN_DB, 200);
    return json({ ok: true, logs });
  }
  if (url.pathname === "/api/admin/v1/commands" && request.method === "GET") {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    const commands = await listAdminCommands(env.ADMIN_DB, 200);
    return json({ ok: true, commands });
  }
  if (url.pathname === "/api/admin/v1/commands" && request.method === "POST") {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    const body = await request.json().catch(() => ({}));
    const commandType = (body.commandType ?? "").trim();
    if (!commandType) {
      return json({ ok: false, error: "commandType is required" }, 400);
    }
    const commandId = await insertAdminCommand(env.ADMIN_DB, {
      actorEmail: auth.email,
      commandType,
      payloadJson: JSON.stringify(body.payload ?? {}),
      status: "received",
      linkedAgentRunId: void 0
    });
    await insertAdminAuditLog(env.ADMIN_DB, {
      actorEmail: auth.email,
      action: "admin.command.created",
      targetType: "admin_agent_commands",
      targetId: commandId,
      metadataJson: JSON.stringify({ commandType })
    });
    if (commandType === "weekly.review") {
      const run = await runWeeklyReview(env, auth.email);
      await updateAdminCommandStatus(env.ADMIN_DB, commandId, run.status, run.runId);
      await insertAdminAuditLog(env.ADMIN_DB, {
        actorEmail: auth.email,
        action: "admin.command.executed",
        targetType: "agent_run",
        targetId: run.runId,
        metadataJson: JSON.stringify({ commandId, commandType, status: run.status })
      });
      return json({ ok: true, commandId, execution: run });
    }
    await updateAdminCommandStatus(env.ADMIN_DB, commandId, "queued");
    return json({ ok: true, commandId, status: "queued", note: "Command accepted and queued for future handlers." });
  }
  if (url.pathname === "/api/admin/v1/chat" && request.method === "POST") {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    const body = await request.json().catch(() => ({}));
    const message = (body.message ?? "").trim();
    if (!message) {
      return json({ ok: false, error: "message is required" }, 400);
    }
    const reply = generateAgentChatReply(message);
    await insertAdminChatMessage(env.ADMIN_DB, {
      channel: "web",
      actorEmail: auth.email,
      message,
      response: reply.response
    });
    await insertAdminAuditLog(env.ADMIN_DB, {
      actorEmail: auth.email,
      action: "admin.chat.sent",
      targetType: "admin_chat_messages",
      targetId: void 0,
      metadataJson: JSON.stringify({ tags: reply.tags })
    });
    const messages = await listAdminChatMessages(env.ADMIN_DB, 50);
    return json({ ok: true, response: reply.response, tags: reply.tags, messages });
  }
  if (url.pathname.startsWith("/api/admin/v1")) {
    return new Response("Not found", { status: 404 });
  }
  return null;
}
__name(handleAdminRoutes, "handleAdminRoutes");
async function handleTelegramAdminWebhook(request, env) {
  const url = new URL(request.url);
  const secret = env.TELEGRAM_WEBHOOK_SECRET ?? "__missing__";
  if (url.pathname !== `/api/telegram/webhook/${secret}`) {
    return null;
  }
  await ensureAdminSchema(env.ADMIN_DB);
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const update = await request.json().catch(() => ({}));
  const updateId = update.update_id;
  const messageText = update.message?.text?.trim() ?? "";
  const chatId = update.message?.chat?.id;
  const messageId = update.message?.message_id;
  if (!chatId) {
    return json({ ok: true, ignored: true, reason: "No chat id in update" });
  }
  if (typeof updateId === "number") {
    const processed = await hasTelegramUpdateBeenProcessed(env.ADMIN_DB, updateId);
    if (processed) {
      return json({ ok: true, ignored: true, reason: "Duplicate update ignored" });
    }
    await markTelegramUpdateProcessed(env.ADMIN_DB, updateId, String(chatId), messageId);
  }
  const allowedChatIds = parseAllowedTelegramChatIds(env.TELEGRAM_ADMIN_CHAT_IDS);
  if (allowedChatIds.size > 0 && !allowedChatIds.has(String(chatId))) {
    await insertAdminAuditLog(env.ADMIN_DB, {
      actorEmail: `telegram:${chatId}`,
      action: "telegram.rejected",
      targetType: "telegram_chat",
      targetId: String(chatId),
      metadataJson: JSON.stringify({ reason: "chat id not allowlisted" })
    });
    return json({ ok: false, error: "Chat ID not allowed" }, 403);
  }
  const reply = generateAgentChatReply(messageText);
  await insertAdminChatMessage(env.ADMIN_DB, {
    channel: "telegram",
    actorEmail: `telegram:${chatId}`,
    message: messageText,
    response: reply.response
  });
  await insertAdminAuditLog(env.ADMIN_DB, {
    actorEmail: `telegram:${chatId}`,
    action: "telegram.chat.received",
    targetType: "admin_chat_messages",
    targetId: createRequestId("telegram-chat-event"),
    metadataJson: JSON.stringify({ tags: reply.tags })
  });
  if (env.TELEGRAM_BOT_TOKEN) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, reply.response);
  }
  return json({ ok: true });
}
__name(handleTelegramAdminWebhook, "handleTelegramAdminWebhook");

// src/index.ts
function json2(data, status2 = 200) {
  return new Response(JSON.stringify(data), {
    status: status2,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
__name(json2, "json");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    await ensureSchema(env.AGENT_DB);
    if (url.pathname === "/health") {
      return json2({ ok: true, status: "healthy", service: "bitecode-agentic-orchestrator" });
    }
    const adminResponse = await handleAdminRoutes(request, env);
    if (adminResponse) {
      return adminResponse;
    }
    const telegramResponse = await handleTelegramAdminWebhook(request, env);
    if (telegramResponse) {
      return telegramResponse;
    }
    if (url.pathname === "/admin/run-weekly-review") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      const auth = request.headers.get("x-admin-token") ?? "";
      if (auth !== env.AGENTIC_ADMIN_TOKEN) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      const actor = request.headers.get("x-actor") ?? "admin";
      const result = await runWeeklyReview(env, actor);
      return json2(result, result.ok ? 200 : 403);
    }
    return new Response("Not found", { status: 404 });
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
