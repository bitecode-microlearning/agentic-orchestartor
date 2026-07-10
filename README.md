# BiteCode Agentic Orchestrator

This repository contains a safe, Cloudflare-native scaffold for an agentic orchestration layer for BiteCode.

## What this repo is
- A worker-based orchestrator for weekly reviews, approvals, and documentation tasks.
- A place to host future specialist agents without destructive automation.

## What this repo is not
- Not the website frontend.
- Not a production database writer.
- Not a social publishing system.

## Architecture overview
- Worker entrypoint: src/index.ts
- Admin backend services: src/admin-backend and src/adminService.ts
- Admin web app: src/admin-webapp and src/adminWebApp.ts
- Admin database schema: src/admin-db/schema.sql
- Contracts and policies: src/contracts and src/policies
- Tool wrappers: src/tools
- Specialist agents: src/agents
- Workflows: src/workflows

## Local development
- npm install
- npm run typecheck
- npm test
- npm run dev

## Safe deployment commands
All deploy scripts use `--keep-vars` to avoid overwriting dashboard-configured runtime values.

- npm run deploy
- npm run deploy:dev
- npm run deploy:prod
- npm run deploy:keepsecrets
- npm run deploy:dev:keepsecrets
- npm run deploy:prod:keepsecrets

Set sensitive values as Worker secrets (not plain vars):
- npx.cmd wrangler secret put AGENTIC_ADMIN_TOKEN --env production
- npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN --env production
- npx.cmd wrangler secret put TELEGRAM_WEBHOOK_SECRET --env production

## Admin website
- Admin UI path: /admin
- Identity API: /api/admin/v1/me
- Job list API: /api/admin/v1/jobs
- Logs API: /api/admin/v1/logs
- Admin users API: /api/admin/v1/users
- Admin audit API: /api/admin/v1/audit
- Admin commands API: /api/admin/v1/commands
- Agent web chat API: /api/admin/v1/chat
- Jira status command: /jiracheck <ticket key or task description>

The admin routes require authentication. The implementation supports:
- Cloudflare Access identity via cf-access-authenticated-user-email (preferred)
- x-admin-token fallback for local and automation

### Gmail-only authentication
Configure Cloudflare Access in front of the worker and use Google as the identity provider.
Set these vars in Wrangler:
- ALLOWED_GOOGLE_DOMAIN=gmail.com
- ADMIN_EMAIL_ALLOWLIST (optional comma-separated exact emails)

Only emails matching the allowed domain (and allowlist if set) can access /admin and /api/admin/*.

## Telegram chat integration
Webhook endpoint:
- /api/telegram/webhook/{TELEGRAM_WEBHOOK_SECRET}

Required secret/vars:
- TELEGRAM_BOT_TOKEN (Wrangler secret)
- TELEGRAM_WEBHOOK_SECRET (Wrangler var/secret)
- TELEGRAM_ADMIN_CHAT_IDS (optional comma-separated chat ID allowlist)

Telegram updates are stored in ADMIN_DB chat logs and answered with a safe non-destructive placeholder agent response.

### Jira status lookup
The `/jiracheck` command looks for either:
- A ticket key like `BITE-123`
- A short free-text description like `cloudflare migration`

It then ranks Jira issues by similarity, returns a one-sentence summary, the latest status, and one extra sentence from the latest comment or linked Confluence page when available.

Set these Atlassian values for Jira lookups:
- ATLASSIAN_BASE_URL
- ATLASSIAN_EMAIL
- ATLASSIAN_API_TOKEN
- JIRA_PROJECT_KEY

## Required resources
- D1 database binding AGENT_DB
- D1 database binding ADMIN_DB
- R2 bucket binding AI_AUDIT_BUCKET
- Optional queue binding SYSTEM_EVENTS_QUEUE

## Safety model
- The first MVP follows read -> analyze -> document -> create Jira ticket -> wait for approval.
- Destructive actions require an approval request and are blocked by default.

## Production notes
- AGENT_DB is used only for agent workflow run records and logs.
- ADMIN_DB is used for admin users, sessions, audit logs, admin commands, and admin chat messages.
- Agent workflows do not write to ADMIN_DB.
- The worker auto-creates required D1 tables if they are missing.
- For production, prefer Wrangler secrets for AGENTIC_ADMIN_TOKEN and TELEGRAM_BOT_TOKEN.

### Create and bind separate admin database
Use Wrangler to create the admin control database and then update wrangler.toml with the returned database_id:

- npx.cmd wrangler d1 create bitecode-admin-prod

After creation, replace ADMIN_DB database_id placeholders in both default and production bindings.

## Future roadmap
- Phase 1: orchestrator, weekly review workflow, Jira/Confluence wrappers, D1 logging, R2 audit references
- Phase 2: DeveloperAgent, GrowthAgent, LearningContentAgent, OperationsAgent, BillingAgent, AuditAgent
- Phase 3: queue-driven workflows, real social imports, human approval UI, deeper Jira/Confluence automation
