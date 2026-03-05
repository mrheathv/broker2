import type { Context } from 'hono';
import type { Env } from '../index';

interface ModelRow {
  id: number;
  provider: string;
  provider_model_id: string;
  display_name: string;
  is_active: number;
  prompt_usd_per_1k: number | null;
  completion_usd_per_1k: number | null;
  snapshot_date: string | null;
  quality_score: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  error_rate: number | null;
}

interface PolicyRow {
  id: number;
  name: string;
  optimize_for: string;
  weight_cost: number;
  weight_quality: number;
  weight_latency: number;
  min_quality: number | null;
  max_estimated_request_cost_usd: number | null;
  max_output_tokens: number | null;
  allowed_providers: string | null;
  blocked_models: string | null;
  fallback_count: number;
  is_default: number;
}

// Reference token counts used to compute comparable policy scores on the dashboard
const REF_PROMPT_TOKENS = 1000;
const REF_COMPLETION_TOKENS = 500;
const LARGE_LATENCY_MS = 10_000;

function computeScore(
  policy: PolicyRow,
  quality: number,
  estimatedCost: number,
  latencyP95: number | null
): number {
  const latency = latencyP95 ?? LARGE_LATENCY_MS;
  switch (policy.optimize_for) {
    case 'lowest_cost':
      return -estimatedCost;
    case 'highest_quality':
      return quality;
    case 'lowest_latency':
      return -latency;
    case 'balanced':
    default:
      return (
        policy.weight_quality * quality -
        policy.weight_cost * estimatedCost -
        policy.weight_latency * (latency / 1000)
      );
  }
}

export async function dashboardHandler(c: Context<{ Bindings: Env }>) {
  const { results: rows } = await c.env.DB.prepare(
    `SELECT
       m.id, m.provider, m.provider_model_id, m.display_name, m.is_active,
       ps.prompt_usd_per_1k, ps.completion_usd_per_1k, ps.snapshot_date,
       COALESCE(pm.quality_score_overall, 0.5) AS quality_score,
       pm.latency_p50_ms, pm.latency_p95_ms, pm.error_rate
     FROM models m
     LEFT JOIN pricing_snapshots ps
       ON ps.model_id = m.id
       AND ps.snapshot_date = (
         SELECT MAX(snapshot_date) FROM pricing_snapshots WHERE model_id = m.id
       )
     LEFT JOIN performance_metrics pm ON pm.model_id = m.id
     ORDER BY m.provider, m.display_name`
  ).all<ModelRow>();

  const defaultPolicy = await c.env.DB.prepare(
    `SELECT * FROM policies WHERE is_default = 1 LIMIT 1`
  ).first<PolicyRow>();

  const models = (rows ?? []).map((m) => {
    const estimatedCost =
      m.prompt_usd_per_1k != null && m.completion_usd_per_1k != null
        ? (REF_PROMPT_TOKENS / 1000) * m.prompt_usd_per_1k +
          (REF_COMPLETION_TOKENS / 1000) * m.completion_usd_per_1k
        : null;

    const policyScore =
      defaultPolicy && estimatedCost !== null
        ? computeScore(defaultPolicy, m.quality_score, estimatedCost, m.latency_p95_ms)
        : null;

    return {
      id: m.id,
      provider: m.provider,
      providerModelId: m.provider_model_id,
      displayName: m.display_name,
      isActive: Boolean(m.is_active),
      snapshotDate: m.snapshot_date,
      promptUsdPer1k: m.prompt_usd_per_1k,
      completionUsdPer1k: m.completion_usd_per_1k,
      qualityScore: m.quality_score,
      latencyP50Ms: m.latency_p50_ms,
      latencyP95Ms: m.latency_p95_ms,
      errorRate: m.error_rate,
      estimatedRefCostUsd: estimatedCost,
      policyScore,
    };
  });

  const latestSnapshotDate =
    models
      .map((m) => m.snapshotDate)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return c.json({
    snapshotDate: latestSnapshotDate,
    defaultPolicy: defaultPolicy?.name ?? null,
    refTokens: { prompt: REF_PROMPT_TOKENS, completion: REF_COMPLETION_TOKENS },
    models,
  });
}
