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

## Required resources
- D1 database binding AGENT_DB
- R2 bucket binding AI_AUDIT_BUCKET
- Optional queue binding SYSTEM_EVENTS_QUEUE

## Safety model
- The first MVP follows read -> analyze -> document -> create Jira ticket -> wait for approval.
- Destructive actions require an approval request and are blocked by default.

## Future roadmap
- Phase 1: orchestrator, weekly review workflow, Jira/Confluence wrappers, D1 logging, R2 audit references
- Phase 2: DeveloperAgent, GrowthAgent, LearningContentAgent, OperationsAgent, BillingAgent, AuditAgent
- Phase 3: queue-driven workflows, real social imports, human approval UI, deeper Jira/Confluence automation
