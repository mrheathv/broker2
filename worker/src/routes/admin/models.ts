import type { Context } from 'hono';
import type { Env } from '../../index';

type AppCtx = Context<{ Bindings: Env }>;

interface ModelRow {
  id: number;
  provider: string;
  provider_model_id: string;
  openrouter_model_id: string | null;
  display_name: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export async function listModels(c: AppCtx) {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM models ORDER BY provider, display_name`
  ).all<ModelRow>();
  return c.json(results ?? []);
}

export async function updateModel(c: AppCtx) {
  const id = c.req.param('id');

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (body.is_active !== undefined) {
    setClauses.push('is_active = ?');
    values.push(body.is_active ? 1 : 0);
  }
  if (typeof body.display_name === 'string') {
    setClauses.push('display_name = ?');
    values.push(body.display_name.trim());
  }
  if (typeof body.provider_model_id === 'string') {
    setClauses.push('provider_model_id = ?');
    values.push(body.provider_model_id.trim());
  }

  if (setClauses.length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }

  setClauses.push(`updated_at = datetime('now')`);
  values.push(id);

  await c.env.DB.prepare(
    `UPDATE models SET ${setClauses.join(', ')} WHERE id = ?`
  )
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare(`SELECT * FROM models WHERE id = ?`)
    .bind(id)
    .first<ModelRow>();

  if (!updated) return c.json({ error: 'Model not found' }, 404);
  return c.json(updated);
}
