export const ADMIN_WEBAPP_HTML = `<!doctype html>
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
      <div id="identity" class="muted">Checking login…</div>
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
  </script>
</body>
</html>`;
