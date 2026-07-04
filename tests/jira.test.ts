import { describe, expect, it } from 'vitest';
import { buildJiraIssuePayload } from '../src/tools/jira';

describe('jira payload builder', () => {
  it('builds a safe issue payload', () => {
    const payload = buildJiraIssuePayload('Weekly review', 'Summarize findings');
    expect(payload.title).toBe('Weekly review');
    expect(payload.labels).toContain('agentic-orchestrator');
  });
});
