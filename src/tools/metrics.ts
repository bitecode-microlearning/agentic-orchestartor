export interface MetricsSummary {
  bitecode: number;
  social: number;
  billing: number;
}

export function buildMetricsSummary(): MetricsSummary {
  return {
    bitecode: 0,
    social: 0,
    billing: 0,
  };
}
