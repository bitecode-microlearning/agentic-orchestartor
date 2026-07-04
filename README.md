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
- Contracts and policies: src/contracts and src/policies
- Tool wrappers: src/tools
- Specialist agents: src/agents
- Workflows: src/workflows

## Local development
- npm install
- npm run typecheck
- npm test
- npm run dev

## Admin website
- Admin UI path: /admin
- Job list API: /api/admin/jobs
- Logs API: /api/admin/logs
- Agent web chat API: /api/admin/chat

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

Telegram updates are stored as chat logs and answered with a safe non-destructive placeholder agent response.

## Required resources
- D1 database binding AGENT_DB
- R2 bucket binding AI_AUDIT_BUCKET
- Optional queue binding SYSTEM_EVENTS_QUEUE

## Safety model
- The first MVP follows read -> analyze -> document -> create Jira ticket -> wait for approval.
- Destructive actions require an approval request and are blocked by default.

## Production notes
- AGENT_DB is used for run records, logs, and chat message persistence.
- The worker auto-creates required D1 tables if they are missing.
- For production, prefer Wrangler secrets for AGENTIC_ADMIN_TOKEN and TELEGRAM_BOT_TOKEN.

## Future roadmap
- Phase 1: orchestrator, weekly review workflow, Jira/Confluence wrappers, D1 logging, R2 audit references
- Phase 2: DeveloperAgent, GrowthAgent, LearningContentAgent, OperationsAgent, BillingAgent, AuditAgent
- Phase 3: queue-driven workflows, real social imports, human approval UI, deeper Jira/Confluence automation
