export interface ConfluencePagePayload {
  title: string;
  body: string;
}

export function buildConfluencePagePayload(title: string, body: string): ConfluencePagePayload {
  return {
    title,
    body,
  };
}
