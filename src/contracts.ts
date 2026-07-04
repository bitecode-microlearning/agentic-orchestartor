export type EnvironmentName = 'development' | 'test' | 'production';

export interface OrchestrationRequest {
  source: string;
  intent: string;
  payload?: Record<string, unknown>;
  allowExternalCalls?: boolean;
}

export interface AgentContext {
  requestId: string;
  actor: string;
  environment: EnvironmentName;
  policy: {
    allowExternalToolCalls: boolean;
    requireApproval: boolean;
  };
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  redactedInput: Record<string, unknown>;
}

export interface WorkflowResult {
  requestId: string;
  status: 'completed' | 'blocked';
  summary: string;
  agents: Array<{ name: string; status: string; summary: string }>;
  evidence: Array<Record<string, unknown>>;
}
