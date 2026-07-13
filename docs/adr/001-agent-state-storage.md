# ADR 001: Agent state storage

## Decision

Use D1 for MVP task, incident, approval, audit metadata, observations, and global runtime state. Use R2 for larger immutable AI audit payloads.

## Rationale

The existing repository already has a D1 `AGENT_DB` binding. D1 gives simple SQL indexes for Telegram and internal queries. Durable Object SQLite remains a future coordination option, but adding it now would increase MVP complexity.
