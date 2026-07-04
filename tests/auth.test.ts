import { describe, expect, it } from 'vitest';
import { getAdminAuth } from '../src/auth';

describe('admin auth', () => {
  it('accepts gmail identity from cloudflare access', () => {
    const request = new Request('https://example.com/admin', {
      headers: { 'cf-access-authenticated-user-email': 'demo.user@gmail.com' },
    });

    const result = getAdminAuth(request, { allowedGoogleDomain: 'gmail.com' });
    expect(result.authenticated).toBe(true);
    expect(result.email).toBe('demo.user@gmail.com');
  });

  it('rejects non-gmail identity', () => {
    const request = new Request('https://example.com/admin', {
      headers: { 'cf-access-authenticated-user-email': 'admin@company.com' },
    });

    const result = getAdminAuth(request, { allowedGoogleDomain: 'gmail.com' });
    expect(result.authenticated).toBe(false);
  });

  it('accepts fallback token', () => {
    const request = new Request('https://example.com/admin', {
      headers: { 'x-admin-token': 'abc123' },
    });

    const result = getAdminAuth(request, { fallbackToken: 'abc123', allowedGoogleDomain: 'gmail.com' });
    expect(result.authenticated).toBe(true);
  });
});
