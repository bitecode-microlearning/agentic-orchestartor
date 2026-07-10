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

async function fetchJson<T>(url: string, auth: JiraToolAuth): Promise<T> {
  const response = await fetch(url, {
    headers: {
      authorization: buildAuthHeader(auth.email, auth.apiToken),
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Jira request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchConfluenceSnippet(auth: JiraToolAuth, pageUrl: string): Promise<string | undefined> {
  const pageId = extractConfluencePageId(pageUrl);
  if (!pageId) {
    return undefined;
  }

  const contentUrl = `${auth.baseUrl}/wiki/rest/api/content/${pageId}?expand=title,version,body.storage`;
  const data = await fetchJson<{ title?: string; body?: { storage?: { value?: string } } }>(contentUrl, auth);
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
  const issue = await fetchJson<{
    key: string;
    fields?: {
      summary?: string;
      status?: { name?: string };
      updated?: string;
      description?: unknown;
      comment?: { comments?: Array<{ body?: unknown }> };
    };
  }>(issueUrl, auth);

  const summary = issue.fields?.summary ?? '';
  const status = issue.fields?.status?.name ?? 'Unknown';
  const updated = issue.fields?.updated;
  const descriptionText = typeof issue.fields?.description === 'string' ? issue.fields.description : JSON.stringify(issue.fields?.description ?? '');
  const comments = (issue.fields?.comment?.comments ?? []).map((comment) => (typeof comment.body === 'string' ? comment.body : JSON.stringify(comment.body ?? ''))).filter(Boolean);

  const confluenceNotes: string[] = [];
  const maybeLinks = [descriptionText, ...comments].flatMap((text) => text.match(/https?:\/\/[^\s)\]]+/gi) ?? []);
  for (const link of maybeLinks) {
    if (link.includes('atlassian.net/wiki')) {
      const snippet = await fetchConfluenceSnippet(auth, link);
      if (snippet) {
        confluenceNotes.push(snippet);
      }
    }
  }

  return {
    key: issue.key,
    summary,
    status,
    updated,
    description: descriptionText,
    commentCount: comments.length,
    comments,
    confluenceNotes,
    url: `${auth.baseUrl}/browse/${issue.key}`,
  };
}

async function searchIssues(auth: JiraToolAuth, query: string): Promise<Array<JiraIssueDetails & { score: number }>> {
  const parsed = JiraSearchInputSchema.parse({ query, projectKey: auth.projectKey });
  const compactQuery = normalizeText(parsed.query).split(' ').slice(0, 5).join(' ');
  const jql = `project = ${parsed.projectKey} ORDER BY updated DESC`;
  const searchUrl = `${auth.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=20&fields=summary,status,updated,description,comment`;
  const data = await fetchJson<{
    issues?: Array<{
      key: string;
      fields?: {
        summary?: string;
        status?: { name?: string };
        updated?: string;
        description?: unknown;
        comment?: { comments?: Array<{ body?: unknown }> };
      };
    }>;
  }>(searchUrl, auth);

  const candidates = data.issues ?? [];
  const scored = await Promise.all(
    candidates.map(async (issue) => {
      const summary = issue.fields?.summary ?? '';
      const status = issue.fields?.status?.name ?? 'Unknown';
      const updated = issue.fields?.updated;
      const descriptionText = typeof issue.fields?.description === 'string' ? issue.fields.description : JSON.stringify(issue.fields?.description ?? '');
      const comments = (issue.fields?.comment?.comments ?? []).map((comment) => (typeof comment.body === 'string' ? comment.body : JSON.stringify(comment.body ?? ''))).filter(Boolean);
      const composite = `${issue.key} ${summary} ${descriptionText} ${comments.join(' ')}`;
      const score = scoreSimilarity(compactQuery, composite);
      const confluenceNotes: string[] = [];
      const maybeLinks = [descriptionText, ...comments].flatMap((text) => text.match(/https?:\/\/[^\s)\]]+/gi) ?? []);
      for (const link of maybeLinks) {
        if (link.includes('atlassian.net/wiki')) {
          const snippet = await fetchConfluenceSnippet(auth, link);
          if (snippet) {
            confluenceNotes.push(snippet);
          }
        }
      }

      return {
        key: issue.key,
        summary,
        status,
        updated,
        description: descriptionText,
        commentCount: comments.length,
        comments,
        confluenceNotes,
        url: `${auth.baseUrl}/browse/${issue.key}`,
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
}

export function formatJiraCheckReply(outcome: JiraCheckOutcome): string {
  if ('needsInput' in outcome) {
    return outcome.prompt;
  }

  return [outcome.summarySentence, outcome.statusSentence, outcome.contextSentence].join(' ');
}
