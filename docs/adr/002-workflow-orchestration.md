# ADR 002: Workflow orchestration

## Decision

Implement a step-oriented health-check service in the Worker and keep the boundaries compatible with a future Cloudflare Workflow.

## Rationale

The existing project has no Workflow binding or account-specific workflow configuration. The service still uses idempotent steps and persistent tasks so it can later be moved into Cloudflare Workflows.
