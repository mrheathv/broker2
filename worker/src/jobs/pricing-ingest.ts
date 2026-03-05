import type { Env } from '../index';

interface OpenRouterPricing {
  prompt?: string | number;
  completion?: string | number;
  image?: string | number;
  request?: string | number;
}

interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: OpenRouterPricing;
  [key: string]: unknown;
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

interface IngestResult {
  synced: number;
  errors: string[];
  date: string;
}

/**
 * Fetch all models from OpenRouter and upsert today's pricing snapshots.
 * OpenRouter pricing fields are USD per token (e.g. 0.000005 = $5/M tokens).
 * We store as USD per 1K tokens: multiply raw value × 1000.
 * Idempotent: running twice the same day upserts (no duplicates).
 */
export async function runPricingIngest(env: Env): Promise<IngestResult> {
  const today = new Date().toISOString().split('T')[0];
  const errors: string[] = [];
  let synced = 0;

  console.log(`[pricing-ingest] Starting for ${today}`);

  let orModels: OpenRouterModel[];
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'User-Agent': 'model-board/1.0' },
    });
    if (!res.ok) {
      throw new Error(`OpenRouter returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as OpenRouterResponse;
    orModels = body.data ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pricing-ingest] Fetch failed: ${msg}`);
    return { synced: 0, errors: [msg], date: today };
  }

  console.log(`[pricing-ingest] Received ${orModels.length} models from OpenRouter`);

  for (const orModel of orModels) {
    try {
      const openrouterModelId = orModel.id; // e.g. "openai/gpt-4o"
      if (!openrouterModelId) continue;

      const parts = openrouterModelId.split('/');
      const provider = parts[0];
      const providerModelId = parts.slice(1).join('/') || openrouterModelId;
      const displayName = orModel.name || openrouterModelId;

      // Convert per-token to per-1K-tokens
      const toPerK = (val: string | number | undefined): number | null => {
        if (val == null) return null;
        const n = parseFloat(String(val));
        return isNaN(n) ? null : n * 1000;
      };

      const promptUsdPer1k = toPerK(orModel.pricing?.prompt);
      const completionUsdPer1k = toPerK(orModel.pricing?.completion);

      // Upsert model row
      const existing = await env.DB.prepare(
        `SELECT id FROM models WHERE openrouter_model_id = ?`
      )
        .bind(openrouterModelId)
        .first<{ id: number }>();

      let modelId: number;
      if (existing) {
        modelId = existing.id;
        await env.DB.prepare(
          `UPDATE models SET display_name = ?, updated_at = datetime('now') WHERE id = ?`
        )
          .bind(displayName, modelId)
          .run();
      } else {
        const ins = await env.DB.prepare(
          `INSERT INTO models (provider, provider_model_id, openrouter_model_id, display_name, is_active)
           VALUES (?, ?, ?, ?, 1)`
        )
          .bind(provider, providerModelId, openrouterModelId, displayName)
          .run();
        modelId = ins.meta.last_row_id as number;
      }

      // Upsert pricing snapshot — idempotent via ON CONFLICT
      await env.DB.prepare(
        `INSERT INTO pricing_snapshots
           (model_id, snapshot_date, prompt_usd_per_1k, completion_usd_per_1k, source, raw_json)
         VALUES (?, ?, ?, ?, 'openrouter', ?)
         ON CONFLICT(model_id, snapshot_date) DO UPDATE SET
           prompt_usd_per_1k     = excluded.prompt_usd_per_1k,
           completion_usd_per_1k = excluded.completion_usd_per_1k,
           raw_json              = excluded.raw_json`
      )
        .bind(modelId, today, promptUsdPer1k, completionUsdPer1k, JSON.stringify(orModel))
        .run();

      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${orModel.id}: ${msg}`);
    }
  }

  console.log(`[pricing-ingest] Done. synced=${synced} errors=${errors.length}`);
  return { synced, errors, date: today };
}
