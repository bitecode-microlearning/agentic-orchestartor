import { describe, expect, it } from 'vitest';
import { evaluateSafetyPolicy, sanitizeAuditEvent } from '../src/policies';

describe('safety policy', () => {
  it('allows safe requests', () => {
    const result = evaluateSafetyPolicy(
      { source: 'worker', intent: 'status-check', payload: { count: 1 } },
      { requestId: 'req-1', actor: 'tester', environment: 'development', policy: { allowExternalToolCalls: false, requireApproval: true } },
    );

    expect(result.allowed).toBe(true);
  });

  it('redacts sensitive values from audit payloads', () => {
    const result = sanitizeAuditEvent({ actor: 'tester', token: 'secret-token' });
    expect(result.token).toBe('[redacted]');
  });
});
