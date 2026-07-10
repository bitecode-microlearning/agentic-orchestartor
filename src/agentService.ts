import { createAgentContext, createRequestId, logEvent } from './lib';
import { evaluateSafetyPolicy, sanitizeAuditEvent } from './policies';
import type { EnvironmentName } from './contracts';
import { runWorkflow } from './workflows';
import { insertLog, insertRun, updateRunStatus } from './db';

export interface AgentServiceResult {
  ok: boolean;
  requestId: string;
  runId: string;
  status: 'accepted' | 'blocked';
  result?: unknown;
  audit: Record<string, unknown>;
  policy?: Record<string, unknown>;
}

export async function runWeeklyReview(
  env: { ENVIRONMENT?: string; AGENT_DB: D1Database },
  actor: string,
): Promise<AgentServiceResult> {
  const requestId = createRequestId('admin-run-weekly-review');
  const environment: EnvironmentName =
    env.ENVIRONMENT === 'production' || env.ENVIRONMENT === 'test'
      ? (env.ENVIRONMENT as EnvironmentName)
      : 'development';

  const context = createAgentContext({
    requestId,
    actor,
    environment,
    policy: { allowExternalToolCalls: false, requireApproval: true },
  });

  const orchestrationRequest = {
    source: 'cloudflare-worker',
    intent: 'weekly-review',
    payload: { initiatedBy: actor },
    allowExternalCalls: false,
  };

  const policyDecision = evaluateSafetyPolicy(orchestrationRequest, context);
  const sanitizedAudit = sanitizeAuditEvent({ requestId, actor, allowed: policyDecision.allowed, reason: policyDecision.reason });

  const runId = createRequestId('run');
  const now = new Date().toISOString();

  await insertRun(env.AGENT_DB, {
    id: runId,
    requestId,
    runType: 'weekly-review',
    status: 'started',
    summary: 'Weekly review started',
    startedAt: now,
  });

  await insertLog(env.AGENT_DB, {
    id: createRequestId('log'),
    runId,
    level: 'info',
    message: `Weekly review requested by ${actor}`,
    createdAt: now,
  });

  logEvent('weekly review requested', { requestId, allowed: policyDecision.allowed, actor });

  if (!policyDecision.allowed) {
    await updateRunStatus(env.AGENT_DB, runId, 'blocked', 'Blocked by policy', new Date().toISOString());
    await insertLog(env.AGENT_DB, {
      id: createRequestId('log'),
      runId,
      level: 'warn',
      message: 'Weekly review blocked by policy',
      createdAt: new Date().toISOString(),
    });

    return {
      ok: false,
      requestId,
      runId,
      status: 'blocked',
      policy: { ...policyDecision },
      audit: sanitizedAudit,
    };
  }

  const result = await runWorkflow(orchestrationRequest, context);
  await updateRunStatus(env.AGENT_DB, runId, result.status, result.summary, new Date().toISOString());
  await insertLog(env.AGENT_DB, {
    id: createRequestId('log'),
    runId,
    level: 'info',
    message: `Weekly review completed with status ${result.status}`,
    createdAt: new Date().toISOString(),
  });

  return {
    ok: true,
    requestId,
    runId,
    status: 'accepted',
    result,
    audit: sanitizedAudit,
  };
}
