export interface JiraIssuePayload {
  title: string;
  description: string;
  labels: string[];
}

export function buildJiraIssuePayload(title: string, description: string): JiraIssuePayload {
  return {
    title,
    description,
    labels: ['agentic-orchestrator', 'placeholder'],
  };
}
