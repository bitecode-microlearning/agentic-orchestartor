import { z } from 'zod';

export const JiraIssueKeySchema = z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/);

export interface JiraToolAuth {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

export interface JiraIssueSearchCandidate {
  key: string;
  summary: string;
  status: string;
  updated?: string;
  description?: string;
  commentCount?: number;
}

export interface JiraIssueDetails extends JiraIssueSearchCandidate {
  comments: string[];
  confluenceNotes: string[];
  url: string;
}

export interface JiraCheckResult {
  matchedKey: string;
  confidence: number;
  summarySentence: string;
  statusSentence: string;
  contextSentence: string;
  issue: JiraIssueDetails;
}

export type JiraCheckOutcome = JiraCheckResult | { needsInput: true; prompt: string };

export interface JiraStatusListItem {
  key: string;
  summary: string;
  status: string;
  updated?: string;
  url: string;
}

export interface JiraStatusListResult {
  requestedStatus: string;
  issues: JiraStatusListItem[];
}

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

const JiraSearchInputSchema = z.object({
  query: z.string().min(1),
  projectKey: z.string().min(1),
});

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): Set<string> {
  return new Set(normalizeText(text).split(' ').filter((token) => token.length > 2));
}

function scoreSimilarity(query: string, candidate: string): number {
  const queryTokens = tokenize(query);
  const candidateTokens = tokenize(candidate);
  if (queryTokens.size === 0 || candidateTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.max(queryTokens.size, candidateTokens.size);
}

function findFirstConfluenceUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s)\]]+/i);
  if (!match) {
    return undefined;
  }

  const url = match[0];
  if (!url.includes('atlassian.net/wiki')) {
    return undefined;
  }

  return url;
}

function extractConfluencePageId(url: string): string | undefined {
  const pageMatch = url.match(/\/pages\/(\d+)\//i);
  if (pageMatch?.[1]) {
    return pageMatch[1];
  }

  const tinyMatch = url.match(/\/wiki\/x\/([A-Za-z0-9]+)/i);
  if (tinyMatch?.[1]) {
    return tinyMatch[1];
  }

  return undefined;
}

function toBase64(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(value);
  }

  return Buffer.from(value, 'utf8').toString('base64');
}

function buildAuthHeader(email: string, apiToken: string): string {
  return `Basic ${toBase64(`${email}:${apiToken}`)}`;
}

function escapeJqlValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

async function fetchJson<T>(url: string, auth: JiraToolAuth, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        authorization: buildAuthHeader(auth.email, auth.apiToken),
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Jira request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

interface JiraSearchResultIssue {
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    updated?: string;
    description?: unknown;
    comment?: { comments?: Array<{ body?: unknown }> };
  };
}

function buildIssueDetailsFromSearchResult(auth: JiraToolAuth, issue: JiraSearchResultIssue): JiraIssueDetails {
  const summary = issue.fields?.summary ?? '';
  const status = issue.fields?.status?.name ?? 'Unknown';
  const updated = issue.fields?.updated;
  const descriptionText = typeof issue.fields?.description === 'string' ? issue.fields.description : JSON.stringify(issue.fields?.description ?? '');
  const comments = (issue.fields?.comment?.comments ?? [])
    .map((comment) => (typeof comment.body === 'string' ? comment.body : JSON.stringify(comment.body ?? '')))
    .filter(Boolean);

  return {
    key: issue.key,
    summary,
    status,
    updated,
    description: descriptionText,
    commentCount: comments.length,
    comments,
    confluenceNotes: [],
    url: `${auth.baseUrl}/browse/${issue.key}`,
  };
}

async function fetchConfluenceSnippet(auth: JiraToolAuth, pageUrl: string): Promise<string | undefined> {
  const pageId = extractConfluencePageId(pageUrl);
  if (!pageId) {
    return undefined;
  }

  const contentUrl = `${auth.baseUrl}/wiki/rest/api/content/${pageId}?expand=title,version,body.storage`;
  const data = await fetchJson<{ title?: string; body?: { storage?: { value?: string } } }>(contentUrl, auth, 6000);
  const storage = data.body?.storage?.value ?? '';
  const snippet = storage.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  const title = data.title?.trim();

  if (title && snippet) {
    return `${title}: ${snippet}`;
  }

  return title || snippet || undefined;
}

async function getIssueDetails(auth: JiraToolAuth, key: string): Promise<JiraIssueDetails> {
  const issueUrl = `${auth.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,updated,description,comment`;
  try {
    const issue = await fetchJson<JiraSearchResultIssue>(issueUrl, auth, 8000);
    const details = buildIssueDetailsFromSearchResult(auth, issue);
    const confluenceNotes: string[] = [];
    const maybeLinks = [details.description ?? '', ...details.comments].flatMap((text) => text.match(/https?:\/\/[^\s)\]]+/gi) ?? []);

    for (const link of maybeLinks) {
      if (!link.includes('atlassian.net/wiki')) {
        continue;
      }

      try {
        const snippet = await fetchConfluenceSnippet(auth, link);
        if (snippet) {
          confluenceNotes.push(snippet);
        }
      } catch {
        continue;
      }
    }

    return {
      ...details,
      confluenceNotes,
    };
  } catch (error) {
    const searchUrl = `${auth.baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(`key = ${key}`)}&maxResults=1&fields=summary,status,updated,description,comment`;
    const searchResult = await fetchJson<{ issues?: JiraSearchResultIssue[] }>(searchUrl, auth, 8000);
    const issue = searchResult.issues?.[0];

    if (!issue) {
      throw error;
    }

    const details = buildIssueDetailsFromSearchResult(auth, issue);
    const confluenceNotes: string[] = [];
    const maybeLinks = [details.description ?? '', ...details.comments].flatMap((text) => text.match(/https?:\/\/[^\s)\]]+/gi) ?? []);

    for (const link of maybeLinks) {
      if (!link.includes('atlassian.net/wiki')) {
        continue;
      }

      try {
        const snippet = await fetchConfluenceSnippet(auth, link);
        if (snippet) {
          confluenceNotes.push(snippet);
        }
      } catch {
        continue;
      }
    }

    return {
      ...details,
      confluenceNotes,
    };
  }
}

async function searchIssues(auth: JiraToolAuth, query: string): Promise<Array<JiraIssueDetails & { score: number }>> {
  const parsed = JiraSearchInputSchema.parse({ query, projectKey: auth.projectKey });
  const compactQuery = normalizeText(parsed.query).split(' ').slice(0, 5).join(' ');
  const jql = `project = ${parsed.projectKey} ORDER BY updated DESC`;
  const searchUrl = `${auth.baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=20&fields=summary,status,updated,description,comment`;
  const data = await fetchJson<{
    issues?: JiraSearchResultIssue[];
  }>(searchUrl, auth, 8000);

  const candidates = data.issues ?? [];
  const scored = await Promise.all(
    candidates.map(async (issue) => {
      const details = buildIssueDetailsFromSearchResult(auth, issue);
      const composite = `${details.key} ${details.summary} ${details.description ?? ''} ${details.comments.join(' ')}`;
      const score = scoreSimilarity(compactQuery, composite);
      const confluenceNotes: string[] = [];
      const maybeLinks = [details.description ?? '', ...details.comments].flatMap((text) => text.match(/https?:\/\/[^\s)\]]+/gi) ?? []);
      for (const link of maybeLinks) {
        if (!link.includes('atlassian.net/wiki')) {
          continue;
        }

        try {
          const snippet = await fetchConfluenceSnippet(auth, link);
          if (snippet) {
            confluenceNotes.push(snippet);
          }
        } catch {
          continue;
        }
      }

      return {
        ...details,
        confluenceNotes,
        score,
      };
    }),
  );

  return scored.sort((a, b) => b.score - a.score);
}

export function summarizeJiraIssue(issue: JiraIssueDetails, confidence: number): JiraCheckResult {
  const latestComment = issue.comments[0]?.replace(/\s+/g, ' ').trim();
  const latestContext = issue.confluenceNotes[0]?.replace(/\s+/g, ' ').trim();
  const summarySentence = `${issue.key} is ${issue.status} and appears to be about ${issue.summary}.`;
  const statusSentence = issue.updated ? `Latest update was ${issue.updated}.` : `No update timestamp was returned from Jira.`;
  const contextSentence = latestComment
    ? `Latest comment: ${latestComment.slice(0, 200)}.`
    : latestContext
      ? `Related Confluence note: ${latestContext.slice(0, 200)}.`
      : `No recent comment or linked Confluence note was found.`;

  return {
    matchedKey: issue.key,
    confidence,
    summarySentence,
    statusSentence,
    contextSentence,
    issue,
  };
}

export async function checkJiraIssueStatus(auth: JiraToolAuth, query: string): Promise<JiraCheckOutcome> {
  if (!query.trim()) {
    return { needsInput: true, prompt: 'Send a Jira ticket key like BITE-123 or a short task description like cloudflare migration.' };
  }

  if (!auth.baseUrl || !auth.email || !auth.apiToken || !auth.projectKey) {
    throw new Error('Missing Jira auth configuration');
  }

  const normalized = query.trim();
  try {
    if (JiraIssueKeySchema.safeParse(normalized).success) {
      const issue = await getIssueDetails(auth, normalized);
      return summarizeJiraIssue(issue, 1);
    }

    const issues = await searchIssues(auth, normalized);
    if (issues.length === 0) {
      return { needsInput: true, prompt: `I could not find a close Jira match for "${normalized}". Try a ticket key or a more specific task description.` };
    }

    const [bestMatch, secondMatch] = issues;
    const confidence = Math.min(0.98, Math.max(0.25, scoreSimilarity(normalized, `${bestMatch.key} ${bestMatch.summary} ${bestMatch.description ?? ''}`)));
    if (confidence < 0.28 && secondMatch) {
      return { needsInput: true, prompt: `I found ${bestMatch.key} but it is a weak match. Try the ticket key or refine the description.` };
    }

    return summarizeJiraIssue(bestMatch, confidence);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Jira error';
    return {
      needsInput: true,
      prompt: `Jira lookup failed or timed out (${message}). Try the ticket key again, or verify the Atlassian connection.`,
    };
  }
}

export async function listJiraIssuesByStatus(auth: JiraToolAuth, requestedStatus: string, maxResults = 10): Promise<JiraStatusListResult> {
  const normalizedStatus = requestedStatus.trim();
  if (!normalizedStatus) {
    return { requestedStatus, issues: [] };
  }

  const boundedMax = Math.max(1, Math.min(20, Math.trunc(maxResults)));
  const openLike = normalizedStatus.toLowerCase();
  const statusFilter = openLike === 'open'
    ? 'statusCategory != Done'
    : `status = "${escapeJqlValue(normalizedStatus)}"`;
  const jql = `project = ${auth.projectKey} AND ${statusFilter} ORDER BY updated DESC`;
  const searchUrl = `${auth.baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${boundedMax}&fields=summary,status,updated`;

  const data = await fetchJson<{ issues?: JiraSearchResultIssue[] }>(searchUrl, auth, 8000);
  const issues = (data.issues ?? []).map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? '(no summary)',
    status: issue.fields?.status?.name ?? 'Unknown',
    updated: issue.fields?.updated,
    url: `${auth.baseUrl}/browse/${issue.key}`,
  }));

  return {
    requestedStatus: normalizedStatus,
    issues,
  };
}

export function formatJiraStatusListReply(result: JiraStatusListResult): string {
  if (result.issues.length === 0) {
    return `No Jira tickets found for status "${result.requestedStatus}" in project scope.`;
  }

  const lines = result.issues.map((issue) => `${issue.key} [${issue.status}] - ${issue.summary}`);
  return [
    `Found ${result.issues.length} ticket(s) for status "${result.requestedStatus}":`,
    ...lines,
  ].join('\n');
}

export function formatJiraCheckReply(outcome: JiraCheckOutcome): string {
  if ('needsInput' in outcome) {
    return outcome.prompt;
  }

  return [outcome.summarySentence, outcome.statusSentence, outcome.contextSentence].join(' ');
}

export interface CreateJiraIssueInput extends JiraIssuePayload {
  idempotencyKey: string;
}

export interface CreateJiraIssueResult {
  key: string;
  url: string;
  idempotencyKey: string;
}

function toAdfDescription(text: string): unknown {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: text.slice(0, 30000) }],
      },
    ],
  };
}

export async function createJiraIssue(auth: JiraToolAuth, input: CreateJiraIssueInput): Promise<CreateJiraIssueResult> {
  if (!auth.baseUrl || !auth.email || !auth.apiToken || !auth.projectKey) {
    throw new Error('Missing Jira auth configuration');
  }

  const searchJql = `project = ${auth.projectKey} AND labels = "${escapeJqlValue(input.idempotencyKey)}" ORDER BY created DESC`;
  const existing = await fetchJson<{ issues?: JiraSearchResultIssue[] }>(
    `${auth.baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(searchJql)}&maxResults=1&fields=summary,status`,
    auth,
    8000,
  );
  const existingIssue = existing.issues?.[0];
  if (existingIssue?.key) {
    return { key: existingIssue.key, url: `${auth.baseUrl}/browse/${existingIssue.key}`, idempotencyKey: input.idempotencyKey };
  }

  const response = await fetch(`${auth.baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      authorization: buildAuthHeader(auth.email, auth.apiToken),
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: auth.projectKey },
        summary: input.title.slice(0, 255),
        description: toAdfDescription(input.description),
        issuetype: { name: 'Task' },
        labels: [...new Set([...input.labels, input.idempotencyKey])],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Jira issue creation failed with ${response.status}`);
  }

  const data = (await response.json()) as { key: string };
  return { key: data.key, url: `${auth.baseUrl}/browse/${data.key}`, idempotencyKey: input.idempotencyKey };
}
