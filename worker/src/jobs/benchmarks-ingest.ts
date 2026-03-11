import type { Env } from '../index';

interface AAEvaluations {
  artificial_analysis_intelligence_index?: number | null;
  artificial_analysis_coding_index?: number | null;
  [key: string]: unknown;
}

interface AAModel {
  slug: string;
  evaluations?: AAEvaluations;
}

interface BenchmarkScores {
  intelligence: number | null;
  coding: number | null;
}

interface IngestResult {
  synced: number;
  skipped: number;
  errors: string[];
}

/**
 * Fetch benchmark scores from Artificial Analysis and upsert into performance_metrics.
 * Matches AA model slugs to our provider_model_id by exact or prefix match.
 * Requires ARTIFICIAL_ANALYSIS_API_KEY in worker env.
 * Attribution: data sourced from https://artificialanalysis.ai
 */
export async function runBenchmarksIngest(env: Env): Promise<IngestResult> {
  const errors: string[] = [];
  let synced = 0;
  let skipped = 0;

  if (!env.ARTIFICIAL_ANALYSIS_API_KEY) {
    return { synced: 0, skipped: 0, errors: ['ARTIFICIAL_ANALYSIS_API_KEY not configured'] };
  }

  console.log('[benchmarks-ingest] Fetching from Artificial Analysis...');

  let aaModels: AAModel[];
  try {
    const res = await fetch('https://artificialanalysis.ai/api/v2/data/llms/models', {
      headers: {
        'x-api-key': env.ARTIFICIAL_ANALYSIS_API_KEY,
        'User-Agent': 'model-board/1.0',
      },
    });
    if (!res.ok) throw new Error(`Artificial Analysis API returned HTTP ${res.status}`);
    const body = await res.json();
    // Response may be a top-level array or wrapped in a key
    aaModels = Array.isArray(body) ? (body as AAModel[]) : ((body as { data?: AAModel[]; models?: AAModel[] }).data ?? (body as { models?: AAModel[] }).models ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[benchmarks-ingest] Fetch failed: ${msg}`);
    return { synced: 0, skipped: 0, errors: [msg] };
  }

  console.log(`[benchmarks-ingest] Received ${aaModels.length} models from Artificial Analysis`);

  // Build slug → scores map
  const bySlug = new Map<string, BenchmarkScores>();
  for (const m of aaModels) {
    if (!m.slug) continue;
    bySlug.set(m.slug, {
      intelligence: m.evaluations?.artificial_analysis_intelligence_index ?? null,
      coding: m.evaluations?.artificial_analysis_coding_index ?? null,
    });
  }

  // Load all active DB models
  const { results: dbModels } = await env.DB.prepare(
    `SELECT id, provider_model_id FROM models WHERE is_active = 1`
  ).all<{ id: number; provider_model_id: string }>();

  for (const dbModel of dbModels ?? []) {
    try {
      const pmid = dbModel.provider_model_id;

      // Match strategy: exact → AA slug is prefix of our id → our id is prefix of AA slug
      let scores: BenchmarkScores | undefined = bySlug.get(pmid);
      if (!scores) {
        for (const [slug, s] of bySlug) {
          if (pmid.startsWith(slug) || slug.startsWith(pmid)) {
            scores = s;
            break;
          }
        }
      }

      if (!scores) {
        skipped++;
        continue;
      }

      const existing = await env.DB.prepare(
        `SELECT id FROM performance_metrics WHERE model_id = ?`
      ).bind(dbModel.id).first<{ id: number }>();

      if (existing) {
        await env.DB.prepare(
          `UPDATE performance_metrics
           SET intelligence_index = ?, coding_index = ?, updated_at = datetime('now')
           WHERE model_id = ?`
        ).bind(scores.intelligence, scores.coding, dbModel.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO performance_metrics (model_id, intelligence_index, coding_index)
           VALUES (?, ?, ?)`
        ).bind(dbModel.id, scores.intelligence, scores.coding).run();
      }

      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`model ${dbModel.id} (${dbModel.provider_model_id}): ${msg}`);
    }
  }

  console.log(`[benchmarks-ingest] Done. synced=${synced} skipped=${skipped} errors=${errors.length}`);
  return { synced, skipped, errors };
}
