import type { JiraToolAuth, JiraCheckResult } from './tools/jira';
import { checkJiraIssueStatus } from './tools/jira';

export interface JiraCheckInput {
  query: string;
}

export async function handleJiraCheck(auth: JiraToolAuth, input: JiraCheckInput): Promise<JiraCheckResult | { needsInput: true; prompt: string }> {
  return checkJiraIssueStatus(auth, input.query);
}
