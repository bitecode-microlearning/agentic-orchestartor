# BiteCode Agentic Orchestrator

Cloudflare Worker for the BiteCode Operations Agent MVP. It preserves the existing admin, Telegram, Jira, and Confluence capabilities and adds a persistent operations agent that detects recurring health failures, groups them into incidents, sends Telegram notifications, and creates Jira issues only after approval.

## Architecture summary

- Worker endpoints: `/telegram/webhook`, `/health`, `/internal/status`, `/internal/run-health-check`, `/internal/tasks`, `/internal/incidents`, `/internal/incidents/:id`, and approval endpoints.
- D1 `AGENT_DB`: persistent tasks, observations, incidents, approvals, runtime state, and audit metadata.
- R2 `AI_AUDIT_BUCKET`: immutable diagnosis audit payloads.
- Cron: every 15 minutes, skipped when the agent is paused.
- Jira: Atlassian REST API, idempotent by incident id label.
- Telegram: authorized user allowlist plus webhook secret validation when Telegram sends the secret header.

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run typecheck
npm test
npm run dev
```

## Required secrets and variables

Set secrets with `wrangler secret put` for real deployments:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_USER_IDS`
- `TELEGRAM_CHAT_ID`
- `INTERNAL_STATUS_SECRET`
- `ATLASSIAN_BASE_URL` or `JIRA_BASE_URL`
- `ATLASSIAN_EMAIL` or `JIRA_USER_EMAIL`
- `ATLASSIAN_API_TOKEN` or `JIRA_API_TOKEN`
- `JIRA_PROJECT_KEY`
- `AGENT_ENABLED`
- `APPROVAL_EXPIRATION_MINUTES`
- `INCIDENT_NOTIFICATION_THRESHOLDS`
- `INCIDENT_REOPEN_COOLDOWN_MINUTES`
- `HEALTH_CHECK_TIMEOUT_MS`
- `AI_MODEL`

## Database migration

Apply `migrations/0001_ops_agent.sql` to `AGENT_DB` or let the Worker create compatible tables at startup.

```bash
wrangler d1 execute bitecode-agents-prod --file migrations/0001_ops_agent.sql
```

## Telegram commands

`/status`, `/health`, `/tasks`, `/incidents`, `/incident <id>`, `/approve <approval-token>`, `/reject <approval-token>`, `/run-health-check`, `/pause-agent`, `/resume-agent`, `/help`.

## Deployment

```bash
npm run typecheck
npm test
wrangler deploy --keep-vars
```

## Known limitations

The diagnostic source adapters are MVP placeholders except the Worker self-health signal. Cloudflare Workflows are documented as a future migration because the repository did not have Workflow bindings. AI diagnosis currently uses validated deterministic fallback unless an AI provider is wired behind the same schema boundary.
