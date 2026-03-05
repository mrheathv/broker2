# Model Board

An internal admin web app that:
- Pulls LLM pricing from OpenRouter daily and stores snapshots
- Lets an admin manage per-model performance scores
- Lets an admin configure selection policies (cost vs quality vs latency)
- Exposes a `/api/select-model` API so downstream apps can get a recommended provider+model+params

**Downstream apps call LLM providers (OpenAI, Anthropic, etc.) directly.  Model Board does NOT proxy requests.**

---

## Architecture

| Layer | Technology |
|-------|-----------|
| API / worker | [Hono](https://hono.dev) on **Cloudflare Workers** |
| Database | **Cloudflare D1** (SQLite-compatible) |
| Frontend | **Next.js 14** static export on **Cloudflare Pages** |
| Pricing cron | **Cloudflare Cron Trigger** (daily 08:00 UTC) |
| Auth | Single admin password via env var / CF Secret |

```
broker2/
├── worker/       # Hono API + cron job
└── frontend/     # Next.js admin UI (static export)
```

---

## Quick Start (Local Dev)

### Prerequisites
- Node.js 20+
- `npm` (or `pnpm`/`yarn`)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 1. Install dependencies

```bash
cd worker && npm install
cd ../frontend && npm install
```

### 2. Create a local D1 database

```bash
cd worker

# If you have a Cloudflare account and want a remote D1 too:
# npx wrangler d1 create model-board
# → Copy the returned database_id into wrangler.toml

# Apply migrations (creates local SQLite file + seeds data)
npm run db:migrate:local
```

> **Local dev note:** `--local` stores the DB in `.wrangler/state/v3/d1/`. No Cloudflare account needed.

### 3. Start the worker

```bash
# In worker/
npm run dev        # starts on http://localhost:8787
```

The default admin password is `changeme` (set via `ADMIN_PASSWORD` in `wrangler.toml [vars]`).

### 4. Start the frontend

```bash
# In frontend/
# .env.local already points to http://localhost:8787
npm run dev        # starts on http://localhost:3000
```

Open **http://localhost:3000**, log in with password `changeme`.

---

## Syncing Pricing Data

**Via UI:** Dashboard → click **"Sync Pricing Now"**

**Via curl:**
```bash
curl -X POST http://localhost:8787/api/jobs/pricing-ingest \
  -H "Authorization: Bearer changeme"
```

**Automatically:** Once deployed, a Cloudflare Cron Trigger fires at 08:00 UTC daily.

---

## Select-Model API

Downstream apps call this endpoint to get a recommended model.

```bash
curl -X POST http://localhost:8787/api/select-model \
  -H "Content-Type: application/json" \
  -d '{
    "estimated_prompt_tokens": 1000,
    "estimated_completion_tokens": 500
  }'
```

**With a specific policy:**
```bash
curl -X POST http://localhost:8787/api/select-model \
  -H "Content-Type: application/json" \
  -d '{
    "policy_name": "cheapest",
    "estimated_prompt_tokens": 2000,
    "estimated_completion_tokens": 800
  }'
```

**Response:**
```json
{
  "selected": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "params": {
      "max_output_tokens": 4096
    },
    "estimated_cost_usd": 0.00048
  },
  "fallbacks": [
    {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "params": {},
      "estimated_cost_usd": 0.00023
    }
  ],
  "snapshot_date": "2025-03-05",
  "policy_used": "balanced"
}
```

**Request fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `estimated_prompt_tokens` | number | ✓ | Expected prompt token count |
| `estimated_completion_tokens` | number | ✓ | Expected completion token count |
| `policy_name` | string | | Override which policy to use (default: the marked-default policy) |
| `task` | string | | Informational only (future use: per-task routing) |

---

## Admin UI Routes

| URL | Description |
|-----|-------------|
| `/` | Dashboard — pricing table, policy scores, active toggle |
| `/performance` | Edit quality scores, latency, error rates |
| `/policies` | Create / edit / delete selection policies |
| `/login` | Password login |

---

## API Reference

All admin routes require `Authorization: Bearer <ADMIN_PASSWORD>`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | none | Health check |
| POST | `/api/select-model` | none | Model selection for downstream apps |
| GET | `/api/dashboard` | admin | Models with pricing + scores |
| GET | `/api/admin/models` | admin | List all models |
| PATCH | `/api/admin/models/:id` | admin | Update model (active, display_name, provider_model_id) |
| GET | `/api/admin/performance` | admin | List performance metrics |
| PUT | `/api/admin/performance/:modelId` | admin | Upsert performance metrics |
| GET | `/api/admin/policies` | admin | List policies |
| POST | `/api/admin/policies` | admin | Create policy |
| PUT | `/api/admin/policies/:id` | admin | Update policy |
| DELETE | `/api/admin/policies/:id` | admin | Delete policy |
| POST | `/api/jobs/pricing-ingest` | admin | Manually trigger pricing sync |

---

## Deploying to Cloudflare

### Worker

```bash
cd worker

# 1. Create D1 database (one-time)
npx wrangler d1 create model-board
# → Paste the returned database_id into wrangler.toml

# 2. Apply migrations to remote D1
npm run db:migrate:remote

# 3. Set your real admin password as a secret (not in wrangler.toml)
npx wrangler secret put ADMIN_PASSWORD

# 4. Deploy
npm run deploy
# → Note the workers.dev URL
```

### Frontend (Cloudflare Pages)

1. Push the repo to GitHub/GitLab.
2. In Cloudflare Dashboard → Pages → Create a project → Connect Git.
3. Settings:
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Build output:** `out`
4. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = your worker URL, e.g. `https://model-board.your-subdomain.workers.dev`
5. Deploy.

---

## Provider API Keys

Model Board does **not** store or use provider API keys. Downstream apps hold their own keys and call providers directly.

For reference, the standard env var names used by provider SDKs:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=...
DEEPSEEK_API_KEY=...
GOOGLE_API_KEY=...
MISTRAL_API_KEY=...
```

> To add key storage to Model Board later: add an `api_keys` table with encrypted key values, expose a CRUD UI, and pass the selected key back in the `/select-model` response.

---

## Selection Algorithm

When `/api/select-model` is called:

1. Look up the named policy (or the default one).
2. Fetch all `is_active = 1` models with their latest pricing snapshot and performance metrics.
   - Models with no performance data get `quality_score_overall = 0.5` (configurable later).
3. Filter by policy constraints: `allowed_providers`, `blocked_models`, `min_quality`.
4. Compute `estimated_cost_usd`:
   ```
   cost = (prompt_tokens / 1000) × prompt_usd_per_1k
        + (completion_tokens / 1000) × completion_usd_per_1k
   ```
5. Filter by `max_estimated_request_cost_usd`.
6. Score each remaining model:
   - `lowest_cost`:     `score = -estimated_cost`
   - `highest_quality`: `score = quality_score`
   - `lowest_latency`:  `score = -latency_p95_ms`
   - `balanced`:        `score = wq × quality - wc × cost - wl × (latency_p95 / 1000)`
7. Sort descending. Return top model as `selected`, next `fallback_count` as `fallbacks`.

---

## Environment Variables

### Worker (`wrangler.toml` or Cloudflare Secrets)

| Variable | Description |
|----------|-------------|
| `ADMIN_PASSWORD` | Password for admin UI and API. Use a CF Secret in production. |

### Frontend (`.env.local` or Cloudflare Pages env)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Base URL of the deployed worker |

---

## Development Notes

- **Idempotent pricing ingest:** Running the sync job twice in one day upserts (no duplicate rows) via `ON CONFLICT(model_id, snapshot_date) DO UPDATE`.
- **OpenRouter pricing unit:** The API returns USD per token (e.g. `"0.000005"` = $5/M tokens). The ingest job converts to USD per 1K tokens by multiplying by 1000.
- **Adding a new provider:** Run a pricing sync after adding the provider's models to OpenRouter. Or manually insert a row into `models` via D1 console.
- **Replacing APScheduler/cron:** The Cloudflare Cron Trigger calls the `scheduled()` export in `worker/src/index.ts`. Replace or extend that handler if you move to a different scheduler.
