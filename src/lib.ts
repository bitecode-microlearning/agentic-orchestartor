import type { AgentContext, EnvironmentName } from './contracts';

export function createRequestId(pathname: string): string {
  const prefix = pathname.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').slice(0, 16) || 'request';
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAgentContext(
  input: Omit<AgentContext, 'environment'> & { environment?: EnvironmentName },
): AgentContext {
  return {
    requestId: input.requestId,
    actor: input.actor,
    environment: input.environment ?? 'development',
    policy: input.policy,
  };
}

export function logEvent(message: string, details?: Record<string, unknown>): void {
  const payload = details ? ` ${JSON.stringify(details)}` : '';
  console.info(`[agentic-orchestrator] ${message}${payload}`);
}
