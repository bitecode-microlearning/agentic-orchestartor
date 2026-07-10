export interface AgentChatResult {
  response: string;
  tags: string[];
}

export function generateAgentChatReply(message: string): AgentChatResult {
  const trimmed = message.trim();
  if (!trimmed) {
    return {
      response: 'Please provide a message so I can help with BiteCode operations.',
      tags: ['input.required'],
    };
  }

  const intentHint =
    trimmed.length > 100
      ? 'long-form request'
      : trimmed.toLowerCase().includes('weekly')
        ? 'weekly review request'
        : trimmed.toLowerCase().includes('jira')
          ? 'jira planning request'
          : trimmed.toLowerCase().includes('log')
            ? 'log investigation request'
            : 'general admin request';

  return {
    response:
      `Got it. I identified this as a ${intentHint}.\n\n` +
      'I can help summarize current orchestrator state, suggest Jira tasks, and draft Confluence updates. ' +
      'Destructive actions still require explicit human approval.',
    tags: ['chat.reply', 'approval.first'],
  };
}
