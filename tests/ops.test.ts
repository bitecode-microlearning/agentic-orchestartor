import { describe, expect, it } from 'vitest';
import { allowedTelegram, normalizeForFingerprint, redact } from '../src/ops';

describe('operations agent MVP primitives', () => {
  it('normalizes unstable fingerprint values', () => {
    const a = normalizeForFingerprint('Failed request abc at 2026-07-12T18:10:00Z id 123456 in 42ms at file.ts:12:4');
    const b = normalizeForFingerprint('Failed request def at 2026-07-12T18:12:00Z id 789999 in 99ms at file.ts:99:8');
    expect(a).toBe(b);
  });

  it('redacts sensitive audit fields', () => {
    expect(redact({ authorization: 'Bearer x', nested: { apiToken: 'secret' }, owner: 'a@b.com' })).toEqual({
      authorization: '[redacted]',
      nested: { apiToken: '[redacted]' },
      owner: '[redacted-email]',
    });
  });

  it('rejects unauthorized Telegram users', () => {
    expect(allowedTelegram({ AGENT_DB: {} as D1Database, TELEGRAM_ALLOWED_USER_IDS: '1,2' }, 3)).toBe(false);
    expect(allowedTelegram({ AGENT_DB: {} as D1Database, TELEGRAM_ALLOWED_USER_IDS: '1,2' }, 2)).toBe(true);
  });
});
