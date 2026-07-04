export interface AuthContext {
  authenticated: boolean;
  email?: string;
  reason?: string;
}

export interface AuthOptions {
  fallbackToken?: string;
  allowedGoogleDomain?: string;
  allowlistCsv?: string;
}

export function getAdminAuth(request: Request, options: AuthOptions): AuthContext {
  const accessEmail = request.headers.get('cf-access-authenticated-user-email') ?? undefined;
  const adminTokenHeader = request.headers.get('x-admin-token') ?? '';

  if (options.fallbackToken && adminTokenHeader && adminTokenHeader === options.fallbackToken) {
    return { authenticated: true, email: 'token-auth@local' };
  }

  if (!accessEmail) {
    return { authenticated: false, reason: 'Missing Cloudflare Access identity' };
  }

  const allowedDomain = (options.allowedGoogleDomain ?? 'gmail.com').toLowerCase();
  const allowlist = (options.allowlistCsv ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const normalizedEmail = accessEmail.trim().toLowerCase();
  const inDomain = normalizedEmail.endsWith(`@${allowedDomain}`);
  const inAllowlist = allowlist.length > 0 ? allowlist.includes(normalizedEmail) : true;

  if (!inDomain) {
    return { authenticated: false, reason: `Only @${allowedDomain} accounts are allowed` };
  }

  if (!inAllowlist) {
    return { authenticated: false, reason: 'Email not in admin allowlist' };
  }

  return { authenticated: true, email: normalizedEmail };
}
