import type { AgentContext, OrchestrationRequest, PolicyDecision } from './contracts';

const SENSITIVE_KEYS = ['secret', 'token', 'password', 'apikey', 'authorization'];

export function evaluateSafetyPolicy(
  request: OrchestrationRequest,
  _context: AgentContext,
): PolicyDecision {
  const candidate = JSON.stringify(request.payload ?? {});
  const containsSensitiveData = SENSITIVE_KEYS.some((key) => candidate.toLowerCase().includes(key));
  const allow = !containsSensitiveData && !request.allowExternalCalls;

  return {
    allowed: allow,
    reason: allow
      ? 'Safe placeholder request accepted.'
      : 'Blocked because the request appears to include sensitive data or external execution.',
    redactedInput: redactSensitivePayload(request.payload ?? {}),
  };
}

export function sanitizeAuditEvent(event: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(event).map(([key, value]) => [key, typeof value === 'string' ? redactString(value) : value]),
  );
}

function redactSensitivePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, shouldRedact(key) ? '[redacted]' : value]),
  );
}

function shouldRedact(key: string): boolean {
  return SENSITIVE_KEYS.some((candidate) => key.toLowerCase().includes(candidate));
}

function redactString(value: string): string {
  return value.replace(/(token|secret|password|apikey|authorization)=([^&\s]+)/gi, '$1=[redacted]');
}
