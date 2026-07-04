import { describe, expect, it } from 'vitest';
import { generateAgentChatReply } from '../src/chat';

describe('agent chat reply', () => {
  it('returns input-required message for empty input', () => {
    const result = generateAgentChatReply('   ');
    expect(result.tags).toContain('input.required');
  });

  it('returns safe placeholder response for normal input', () => {
    const result = generateAgentChatReply('Can you summarize today run?');
    expect(result.response).toContain('Destructive actions still require explicit human approval.');
    expect(result.tags).toContain('approval.first');
  });
});
