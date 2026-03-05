import type { Context } from 'hono';
import type { Env } from '../index';

interface SelectModelBody {
  policy_name?: string;
  task?: string;
  estimated_prompt_tokens: number;
  estimated_completion_tokens: number;
}

interface ModelCandidate {
  id: number;
  provider: string;
  provider_model_id: string;
  display_name: string;
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

const LARGE_LATENCY_MS = 10_000;

export async function selectModelHandler(c: Context<{ Bindings: Env }>) {
  let body: SelectModelBody;
  try {
    body = await c.req.json<SelectModelBody>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { policy_name, estimated_prompt_tokens, estimated_completion_tokens } = body;

  if (
    typeof estimated_prompt_tokens !== 'number' ||
    typeof estimated_completion_tokens !== 'number' ||
    estimated_prompt_tokens < 0 ||
    estimated_completion_tokens < 0
  ) {
    return c.json(
      { error: 'estimated_prompt_tokens and estimated_completion_tokens must be non-negative numbers' },
      400
    );
  }

  // Resolve policy
  let policy: PolicyRow | null;
  if (policy_name) {
    policy = await c.env.DB.prepare(`SELECT * FROM policies WHERE name = ?`)
      .bind(policy_name)
      .first<PolicyRow>();
    if (!policy) return c.json({ error: `Policy '${policy_name}' not found` }, 404);
  } else {
    policy = await c.env.DB.prepare(`SELECT * FROM policies WHERE is_default = 1 LIMIT 1`).first<PolicyRow>();
    if (!policy) return c.json({ error: 'No default policy configured' }, 500);
  }

  // Fetch all active models with latest pricing + performance
  const { results: candidates } = await c.env.DB.prepare(
    `SELECT
       m.id, m.provider, m.provider_model_id, m.display_name,
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
     WHERE m.is_active = 1`
  ).all<ModelCandidate>();

  const allowedProviders: string[] | null = policy.allowed_providers
    ? (JSON.parse(policy.allowed_providers) as string[])
    : null;
  const blockedModels: string[] | null = policy.blocked_models
    ? (JSON.parse(policy.blocked_models) as string[])
    : null;

  type Scored = ModelCandidate & { estimatedCost: number; score: number };
  const scored: Scored[] = [];

  for (const m of candidates ?? []) {
    // Provider/model filters
    if (allowedProviders && !allowedProviders.includes(m.provider)) continue;
    if (blockedModels && blockedModels.includes(m.provider_model_id)) continue;
    if (policy.min_quality != null && m.quality_score < policy.min_quality) continue;

    // Cost estimate
    const promptCost =
      m.prompt_usd_per_1k != null ? (estimated_prompt_tokens / 1000) * m.prompt_usd_per_1k : 0;
    const completionCost =
      m.completion_usd_per_1k != null
        ? (estimated_completion_tokens / 1000) * m.completion_usd_per_1k
        : 0;
    const estimatedCost = promptCost + completionCost;

    // Cost ceiling filter
    if (
      policy.max_estimated_request_cost_usd != null &&
      estimatedCost > policy.max_estimated_request_cost_usd
    )
      continue;

    // Score
    const latency = m.latency_p95_ms ?? LARGE_LATENCY_MS;
    let score: number;
    switch (policy.optimize_for) {
      case 'lowest_cost':
        score = -estimatedCost;
        break;
      case 'highest_quality':
        score = m.quality_score;
        break;
      case 'lowest_latency':
        score = -latency;
        break;
      case 'balanced':
      default:
        score =
          policy.weight_quality * m.quality_score -
          policy.weight_cost * estimatedCost -
          policy.weight_latency * (latency / 1000);
    }

    scored.push({ ...m, estimatedCost, score });
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return c.json({ error: 'No models match the policy constraints' }, 404);
  }

  const makeEntry = (m: Scored) => {
    const params: Record<string, number> = {};
    if (policy!.max_output_tokens != null) {
      params.max_output_tokens = policy!.max_output_tokens;
    }
    return {
      provider: m.provider,
      model: m.provider_model_id,
      params,
      estimated_cost_usd: Math.round(m.estimatedCost * 1e8) / 1e8,
    };
  };

  const [selected, ...rest] = scored;
  const fallbacks = rest.slice(0, policy.fallback_count).map(makeEntry);

  return c.json({
    selected: makeEntry(selected),
    fallbacks,
    snapshot_date: selected.snapshot_date ?? null,
    policy_used: policy.name,
  });
}
