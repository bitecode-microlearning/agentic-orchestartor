import type { AgentContext, OrchestrationRequest, WorkflowResult } from './contracts';

export async function runWorkflow(
  _request: OrchestrationRequest,
  context: AgentContext,
): Promise<WorkflowResult> {
  return {
    requestId: context.requestId,
    status: 'completed',
    summary: 'weekly review placeholder',
    agents: [{ name: 'BiteCodeOrchestrator', status: 'completed', summary: 'placeholder' }],
    evidence: [],
  };
}
