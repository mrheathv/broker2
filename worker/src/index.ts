import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { authMiddleware } from './middleware/auth';
import { dashboardHandler } from './routes/dashboard';
import { selectModelHandler } from './routes/select-model';
import { listModels, updateModel } from './routes/admin/models';
import { listPerformance, upsertPerformance } from './routes/admin/performance';
import { listPolicies, createPolicy, updatePolicy, deletePolicy } from './routes/admin/policies';
import { runPricingIngest } from './jobs/pricing-ingest';

export type Env = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
};

const app = new Hono<{ Bindings: Env }>();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use('*', logger());

// ── Public routes ─────────────────────────────────────────────────────────────

app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// Downstream apps call this — no admin auth required
// Add your own API-key middleware here before going to production
app.post('/api/select-model', selectModelHandler);

// ── Admin-protected routes ────────────────────────────────────────────────────

app.use('/api/dashboard', authMiddleware);
app.use('/api/admin/*', authMiddleware);
app.use('/api/jobs/*', authMiddleware);

app.get('/api/dashboard', dashboardHandler);

// Models
app.get('/api/admin/models', listModels);
app.patch('/api/admin/models/:id', updateModel);

// Performance metrics
app.get('/api/admin/performance', listPerformance);
app.put('/api/admin/performance/:modelId', upsertPerformance);

// Policies
app.get('/api/admin/policies', listPolicies);
app.post('/api/admin/policies', createPolicy);
app.put('/api/admin/policies/:id', updatePolicy);
app.delete('/api/admin/policies/:id', deletePolicy);

// Manual pricing ingest trigger
app.post('/api/jobs/pricing-ingest', async (c) => {
  try {
    const result = await runPricingIngest(c.env);
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pricing-ingest] Unhandled error:', msg);
    return c.json({ error: msg }, 500);
  }
});

// ── Exports (fetch + scheduled) ───────────────────────────────────────────────

export default {
  fetch: app.fetch,

  // Called by Cloudflare Cron Trigger (configured in wrangler.toml)
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runPricingIngest(env));
  },
};
