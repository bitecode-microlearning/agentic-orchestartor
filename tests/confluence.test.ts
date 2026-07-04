import { describe, expect, it } from 'vitest';
import { buildConfluencePagePayload } from '../src/tools/confluence';

describe('confluence payload builder', () => {
  it('builds a safe page payload', () => {
    const payload = buildConfluencePagePayload('Weekly BiteCode Agent Review', 'Summary');
    expect(payload.title).toBe('Weekly BiteCode Agent Review');
  });
});
