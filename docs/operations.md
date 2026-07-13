# operations

This MVP focuses on one reliable flow: health checks create normalized observations, recurring failures aggregate into incidents, Telegram notifies an authorized operator, and Jira creation happens only after approval.

## Implemented

- Persistent D1 task, incident, approval, audit, runtime-state tables.
- Telegram allowlist commands: /status, /health, /tasks, /incidents, /incident, /approve, /reject, /run-health-check, /pause-agent, /resume-agent, /help.
- Approval-gated Jira issue creation using Atlassian REST credentials from secrets.
- R2 audit payload support for AI diagnosis metadata.
- Cron every 15 minutes.

## Not implemented in MVP

No production-changing actions, deployments, database modifications outside operational tables, email, branch/PR actions, generated-code execution, or fully autonomous multi-agent behavior.

## Smoke test

1. Copy .dev.vars.example to .dev.vars and fill secrets.
2. Run npm test and npm run typecheck.
3. Run npm run dev.
4. POST /internal/run-health-check with x-admin-token.
5. Inspect /internal/incidents and /internal/status.
6. Send Telegram /run-health-check, /incidents, /approve <token>, /pause-agent, and /resume-agent.
7. Confirm duplicate approval does not create a second Jira issue.
