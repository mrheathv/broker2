import type { Context } from 'hono';
import type { Env } from '../../index';

type AppCtx = Context<{ Bindings: Env }>;

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
  updated_at: string;
}

interface PolicyBody {
  name?: string;
  optimize_for?: string;
  weight_cost?: number;
  weight_quality?: number;
  weight_latency?: number;
  min_quality?: number | null;
  max_estimated_request_cost_usd?: number | null;
  max_output_tokens?: number | null;
  allowed_providers?: string[] | null;
  blocked_models?: string[] | null;
  fallback_count?: number;
  is_default?: boolean;
}

const VALID_OPTIMIZE = ['lowest_cost', 'highest_quality', 'balanced', 'lowest_latency'];

function serializePolicy(row: PolicyRow) {
  return {
    ...row,
    is_default: Boolean(row.is_default),
    allowed_providers: row.allowed_providers ? JSON.parse(row.allowed_providers) : null,
    blocked_models: row.blocked_models ? JSON.parse(row.blocked_models) : null,
  };
}

export async function listPolicies(c: AppCtx) {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM policies ORDER BY is_default DESC, name`
  ).all<PolicyRow>();

  return c.json((results ?? []).map(serializePolicy));
}

export async function createPolicy(c: AppCtx) {
  let body: PolicyBody;
  try {
    body = await c.req.json<PolicyBody>();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  if (body.optimize_for && !VALID_OPTIMIZE.includes(body.optimize_for)) {
    return c.json({ error: `optimize_for must be one of: ${VALID_OPTIMIZE.join(', ')}` }, 400);
  }

  // If marking as default, clear existing default first
  if (body.is_default) {
    await c.env.DB.prepare(`UPDATE policies SET is_default = 0`).run();
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO policies
       (name, optimize_for, weight_cost, weight_quality, weight_latency,
        min_quality, max_estimated_request_cost_usd, max_output_tokens,
        allowed_providers, blocked_models, fallback_count, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.name.trim(),
      body.optimize_for ?? 'balanced',
      body.weight_cost ?? 0.33,
      body.weight_quality ?? 0.33,
      body.weight_latency ?? 0.33,
      body.min_quality ?? null,
      body.max_estimated_request_cost_usd ?? null,
      body.max_output_tokens ?? null,
      body.allowed_providers ? JSON.stringify(body.allowed_providers) : null,
      body.blocked_models ? JSON.stringify(body.blocked_models) : null,
      body.fallback_count ?? 2,
      body.is_default ? 1 : 0
    )
    .run();

  const created = await c.env.DB.prepare(`SELECT * FROM policies WHERE id = ?`)
    .bind(result.meta.last_row_id)
    .first<PolicyRow>();

  return c.json(serializePolicy(created!), 201);
}

export async function updatePolicy(c: AppCtx) {
  const id = c.req.param('id');

  let body: PolicyBody;
  try {
    body = await c.req.json<PolicyBody>();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (body.optimize_for && !VALID_OPTIMIZE.includes(body.optimize_for)) {
    return c.json({ error: `optimize_for must be one of: ${VALID_OPTIMIZE.join(', ')}` }, 400);
  }

  const existing = await c.env.DB.prepare(`SELECT id FROM policies WHERE id = ?`)
    .bind(id)
    .first<{ id: number }>();
  if (!existing) return c.json({ error: 'Policy not found' }, 404);

  // Clear default if this policy will become default
  if (body.is_default) {
    await c.env.DB.prepare(`UPDATE policies SET is_default = 0`).run();
  }

  const setClauses: string[] = [`updated_at = datetime('now')`];
  const values: unknown[] = [];

  const fields: Array<[string, unknown]> = [
    ['name', body.name?.trim()],
    ['optimize_for', body.optimize_for],
    ['weight_cost', body.weight_cost],
    ['weight_quality', body.weight_quality],
    ['weight_latency', body.weight_latency],
    ['min_quality', body.min_quality],
    ['max_estimated_request_cost_usd', body.max_estimated_request_cost_usd],
    ['max_output_tokens', body.max_output_tokens],
    ['fallback_count', body.fallback_count],
  ];

  for (const [col, val] of fields) {
    if (val !== undefined) {
      setClauses.unshift(`${col} = ?`);
      values.unshift(val);
    }
  }

  if (body.allowed_providers !== undefined) {
    setClauses.unshift('allowed_providers = ?');
    values.unshift(body.allowed_providers ? JSON.stringify(body.allowed_providers) : null);
  }
  if (body.blocked_models !== undefined) {
    setClauses.unshift('blocked_models = ?');
    values.unshift(body.blocked_models ? JSON.stringify(body.blocked_models) : null);
  }
  if (body.is_default !== undefined) {
    setClauses.unshift('is_default = ?');
    values.unshift(body.is_default ? 1 : 0);
  }

  values.push(id);

  await c.env.DB.prepare(`UPDATE policies SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare(`SELECT * FROM policies WHERE id = ?`)
    .bind(id)
    .first<PolicyRow>();

  return c.json(serializePolicy(updated!));
}

export async function deletePolicy(c: AppCtx) {
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare(`SELECT id, is_default FROM policies WHERE id = ?`)
    .bind(id)
    .first<{ id: number; is_default: number }>();

  if (!existing) return c.json({ error: 'Policy not found' }, 404);
  if (existing.is_default) return c.json({ error: 'Cannot delete the default policy' }, 400);

  await c.env.DB.prepare(`DELETE FROM policies WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
}
