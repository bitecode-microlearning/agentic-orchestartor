# BiteCode Operations Agent Architecture

The MVP adds a Cloudflare Worker operations agent around the existing Telegram/Jira worker. The worker exposes Telegram and protected internal endpoints, persists searchable operational metadata in D1, stores larger AI audit payloads in R2, and runs every 15 minutes via Cron.

## Runtime flow

1. Cron, Telegram `/run-health-check`, or `POST /internal/run-health-check` creates a health-check task.
2. Diagnostic tools collect deterministic observations. Missing sources use documented placeholder adapters.
3. Observations are normalized and fingerprinted with timestamps, UUIDs, request IDs, long numeric IDs, durations, and stack line numbers removed.
4. Matching observations aggregate into incidents and occurrence counts increase.
5. The diagnosis service validates structured output and falls back to deterministic Jira-ready text.
6. Telegram receives a concise incident summary and opaque approval token.
7. `/approve <token>` or internal approval executes the Jira write tool. The tool is idempotent and searches Jira by incident id label first.
8. D1 audit metadata and R2 detailed AI payloads preserve the audit trail.

## Cloudflare resources

- Worker: HTTP, Telegram webhook, internal API, scheduled handler.
- Cron Trigger: `*/15 * * * *`.
- D1 `AGENT_DB`: tasks, observations, incidents, approvals, audit events, runtime state.
- R2 `AI_AUDIT_BUCKET`: immutable AI request/response audit payloads.
- Secrets: Telegram token, Jira token, internal secret.

## Current durable execution decision

Cloudflare Workflows are not enabled in the existing Wrangler configuration. The MVP implements an explicit step-oriented `runHealthCheck` service that can be moved into a Workflow without changing domain models or repositories.
