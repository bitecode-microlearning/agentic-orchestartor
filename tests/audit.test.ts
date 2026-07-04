import { describe, expect, it } from 'vitest';
import { sanitizeAuditEvent } from '../src/policies';

describe('audit sanitization', () => {
  it('sanitizes audit events', () => {
    const payload = sanitizeAuditEvent({ source: 'workflow', token: 'abc' });
    expect(payload.token).toBe('[redacted]');
  });
});
