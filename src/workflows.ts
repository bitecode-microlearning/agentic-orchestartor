import type { AgentContext, OrchestrationRequest, WorkflowResult } from './contracts';

export async function runWorkflow(
  request: OrchestrationRequest,
  context: AgentContext,
): Promise<WorkflowResult> {
  return {
    requestId: context.requestId,
    status: 'completed',
    summary: `workflow ${request.intent} placeholder completed`,
    agents: [{ name: 'BiteCodeOrchestrator', status: 'completed', summary: 'placeholder' }],
    evidence: [
      {
        source: 'orchestrator',
        note: 'This is an initial non-destructive placeholder workflow result.',
      },
    ],
  };
}
