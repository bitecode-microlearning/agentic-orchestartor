import { describe, expect, it } from 'vitest';
import { summarizeJiraIssue } from '../src/tools/jira';

describe('jira status summary', () => {
  it('creates the expected short format', () => {
    const result = summarizeJiraIssue(
      {
        key: 'BITE-123',
        summary: 'Cloudflare migration',
        status: 'In Progress',
        updated: '2026-07-10T10:00:00.000Z',
        comments: ['Investigating edge cases.'],
        confluenceNotes: ['Migration plan has open dependency on admin auth.'],
        url: 'https://example.com/browse/BITE-123',
      },
      0.91,
    );

    expect(result.summarySentence).toContain('BITE-123 is In Progress');
    expect(result.statusSentence).toContain('Latest update');
    expect(result.contextSentence).toContain('Latest comment');
  });
});
