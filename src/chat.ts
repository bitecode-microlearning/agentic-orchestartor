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

  return {
    response:
      `Acknowledged: ${trimmed}\n\n` +
      'I can help summarize current orchestrator state, suggest Jira tasks, and draft Confluence updates. ' +
      'Destructive actions still require explicit human approval.',
    tags: ['chat.reply', 'approval.first'],
  };
}
