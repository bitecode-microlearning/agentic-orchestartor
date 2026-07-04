export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BiteCode Agentic Admin</title>
  <style>
    :root {
      --bg: #0f172a;
      --panel: #111827;
      --muted: #94a3b8;
      --text: #e2e8f0;
      --accent: #22c55e;
      --warn: #f59e0b;
      --err: #ef4444;
      --border: #1f2937;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      background: radial-gradient(circle at 20% 20%, #1f2937 0, #0f172a 55%);
      color: var(--text);
    }
    .wrap {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      gap: 16px;
    }
    .panel {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: rgba(17, 24, 39, 0.92);
      padding: 16px;
    }
    h1, h2 { margin: 0 0 10px 0; }
    p { margin: 8px 0; color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      text-align: left;
      padding: 8px;
      vertical-align: top;
    }
    .status { color: var(--accent); }
    input, textarea, button {
      width: 100%;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #0b1220;
      color: var(--text);
      padding: 10px;
      font-size: 14px;
    }
    textarea { min-height: 100px; resize: vertical; }
    button {
      cursor: pointer;
      background: #14532d;
      border-color: #166534;
      font-weight: 600;
      margin-top: 8px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      background: #064e3b;
      color: #a7f3d0;
      font-size: 12px;
    }
    pre {
      background: #020617;
      padding: 10px;
      border-radius: 8px;
      overflow: auto;
      border: 1px solid var(--border);
      color: #cbd5e1;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <h1>BiteCode Agentic Admin</h1>
      <p>Authenticated via Cloudflare Access with Google. Allowed domain: gmail.com.</p>
      <p class="badge" id="identity">Checking identity...</p>
    </div>

    <div class="grid">
      <div class="panel">
        <h2>Recent Jobs</h2>
        <table id="jobs-table">
          <thead><tr><th>Run ID</th><th>Status</th><th>Summary</th><th>Started</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="panel">
        <h2>Logs</h2>
        <input id="run-id" placeholder="run id (optional)" />
        <button id="load-logs">Load Logs</button>
        <pre id="logs">[]</pre>
      </div>
    </div>

    <div class="panel">
      <h2>Agent Chat</h2>
      <p>Web chat talks to the orchestrator using a safe placeholder response flow.</p>
      <textarea id="chat-msg" placeholder="Ask the agent..."></textarea>
      <button id="send-chat">Send</button>
      <pre id="chat-out">[]</pre>
    </div>
  </div>

  <script>
    async function fetchJson(url, opts) {
      const res = await fetch(url, opts);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body && body.error) || ("HTTP " + res.status));
      return body;
    }

    async function loadIdentity() {
      try {
        const data = await fetchJson('/api/admin/me');
        document.getElementById('identity').textContent = 'Signed in as ' + data.email;
      } catch (e) {
        document.getElementById('identity').textContent = 'Auth error: ' + e.message;
      }
    }

    async function loadJobs() {
      const data = await fetchJson('/api/admin/jobs');
      const tbody = document.querySelector('#jobs-table tbody');
      tbody.innerHTML = '';
      for (const run of data.runs || []) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + run.id + '</td><td class="status">' + run.status + '</td><td>' + (run.summary || '') + '</td><td>' + run.startedAt + '</td>';
        tbody.appendChild(tr);
      }
    }

    async function loadLogs() {
      const runId = document.getElementById('run-id').value.trim();
      const q = runId ? ('?runId=' + encodeURIComponent(runId)) : '';
      const data = await fetchJson('/api/admin/logs' + q);
      document.getElementById('logs').textContent = JSON.stringify(data.logs || [], null, 2);
    }

    async function sendChat() {
      const message = document.getElementById('chat-msg').value.trim();
      if (!message) return;
      const data = await fetchJson('/api/admin/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message })
      });
      document.getElementById('chat-out').textContent = JSON.stringify(data, null, 2);
    }

    document.getElementById('load-logs').addEventListener('click', loadLogs);
    document.getElementById('send-chat').addEventListener('click', sendChat);

    loadIdentity();
    loadJobs();
    loadLogs();
  </script>
</body>
</html>`;
