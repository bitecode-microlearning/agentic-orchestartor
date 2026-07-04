import { createAgentContext, createRequestId, logEvent } from './lib';
import { evaluateSafetyPolicy, sanitizeAuditEvent } from './policies';
import type { EnvironmentName } from './contracts';
import { runWorkflow } from './workflows';

export interface Env {
  ENVIRONMENT?: string;
  ADMIN_API_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, status: 'healthy', service: 'bitecode-agentic-orchestrator' });
    }

    if (url.pathname === '/admin/run-weekly-review') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const auth = request.headers.get('x-admin-token') ?? '';
      if (auth !== env.ADMIN_API_TOKEN) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }

      const requestId = createRequestId(url.pathname);
      const actor = request.headers.get('x-actor') ?? 'admin';
      const environment: EnvironmentName =
        env.ENVIRONMENT === 'production' || env.ENVIRONMENT === 'test'
          ? (env.ENVIRONMENT as EnvironmentName)
          : 'development';

      const context = createAgentContext({
        requestId,
        actor,
        environment,
        policy: { allowExternalToolCalls: false, requireApproval: true },
      });

      const orchestrationRequest = {
        source: 'cloudflare-worker',
        intent: 'weekly-review',
        payload: { initiatedBy: actor },
        allowExternalCalls: false,
      };

      const policyDecision = evaluateSafetyPolicy(orchestrationRequest, context);
      const sanitizedAudit = sanitizeAuditEvent({ requestId, actor, allowed: policyDecision.allowed, reason: policyDecision.reason });

      logEvent('weekly review requested', { requestId, allowed: policyDecision.allowed });

      if (!policyDecision.allowed) {
        return Response.json({ ok: false, requestId, policy: policyDecision, audit: sanitizedAudit }, { status: 403 });
      }

      const result = await runWorkflow(orchestrationRequest, context);
      return Response.json({ ok: true, requestId, status: 'accepted', result, audit: sanitizedAudit }, { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
