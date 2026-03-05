import type { Context } from 'hono';
import type { Env } from '../../index';

type AppCtx = Context<{ Bindings: Env }>;

interface PerformanceRow {
  id: number;
  model_id: number;
  quality_score_overall: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  error_rate: number | null;
  notes: string | null;
  updated_at: string;
  // joined from models
  provider: string;
  provider_model_id: string;
  display_name: string;
}

export async function listPerformance(c: AppCtx) {
  const { results } = await c.env.DB.prepare(
    `SELECT
       COALESCE(pm.id, 0)                        AS id,
       m.id                                       AS model_id,
       COALESCE(pm.quality_score_overall, 0.5)   AS quality_score_overall,
       pm.latency_p50_ms,
       pm.latency_p95_ms,
       pm.error_rate,
       pm.notes,
       COALESCE(pm.updated_at, datetime('now'))  AS updated_at,
       m.provider,
       m.provider_model_id,
       m.display_name
     FROM models m
     LEFT JOIN performance_metrics pm ON pm.model_id = m.id
     WHERE m.is_active = 1
     ORDER BY m.provider, m.display_name`
  ).all<PerformanceRow>();

  return c.json(results ?? []);
}

export async function upsertPerformance(c: AppCtx) {
  const modelId = c.req.param('modelId');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  // Validate model exists
  const model = await c.env.DB.prepare(`SELECT id FROM models WHERE id = ?`)
    .bind(modelId)
    .first<{ id: number }>();
  if (!model) return c.json({ error: 'Model not found' }, 404);

  // Validate ranges
  const quality = body.quality_score_overall != null ? Number(body.quality_score_overall) : undefined;
  if (quality !== undefined && (quality < 0 || quality > 1)) {
    return c.json({ error: 'quality_score_overall must be between 0 and 1' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM performance_metrics WHERE model_id = ?`
  )
    .bind(modelId)
    .first<{ id: number }>();

  if (existing) {
    const setClauses: string[] = [`updated_at = datetime('now')`];
    const values: unknown[] = [];

    if (quality !== undefined) { setClauses.unshift('quality_score_overall = ?'); values.push(quality); }
    const lp50 = body.latency_p50_ms !== undefined ? body.latency_p50_ms : undefined;
    const lp95 = body.latency_p95_ms !== undefined ? body.latency_p95_ms : undefined;
    const er   = body.error_rate !== undefined ? body.error_rate : undefined;
    const notes = body.notes !== undefined ? body.notes : undefined;

    if (lp50 !== undefined) { setClauses.unshift('latency_p50_ms = ?'); values.unshift(lp50 === null ? null : Number(lp50)); }
    if (lp95 !== undefined) { setClauses.unshift('latency_p95_ms = ?'); values.unshift(lp95 === null ? null : Number(lp95)); }
    if (er !== undefined)   { setClauses.unshift('error_rate = ?');      values.unshift(er === null ? null : Number(er)); }
    if (notes !== undefined){ setClauses.unshift('notes = ?');            values.unshift(notes === null ? null : String(notes)); }

    values.push(modelId);
    await c.env.DB.prepare(
      `UPDATE performance_metrics SET ${setClauses.join(', ')} WHERE model_id = ?`
    )
      .bind(...values)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO performance_metrics
         (model_id, quality_score_overall, latency_p50_ms, latency_p95_ms, error_rate, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        modelId,
        quality ?? 0.5,
        body.latency_p50_ms != null ? Number(body.latency_p50_ms) : null,
        body.latency_p95_ms != null ? Number(body.latency_p95_ms) : null,
        body.error_rate != null ? Number(body.error_rate) : null,
        body.notes != null ? String(body.notes) : null
      )
      .run();
  }

  const result = await c.env.DB.prepare(
    `SELECT pm.*, m.provider, m.provider_model_id, m.display_name
     FROM performance_metrics pm
     JOIN models m ON m.id = pm.model_id
     WHERE pm.model_id = ?`
  )
    .bind(modelId)
    .first<PerformanceRow>();

  return c.json(result);
}
