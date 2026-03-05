-- Model Board schema + seed data
-- Apply with: wrangler d1 migrations apply model-board --local

CREATE TABLE IF NOT EXISTS models (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  provider            TEXT NOT NULL,
  provider_model_id   TEXT NOT NULL,
  openrouter_model_id TEXT,
  display_name        TEXT NOT NULL,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);
CREATE INDEX IF NOT EXISTS idx_models_openrouter_id ON models(openrouter_model_id);

CREATE TABLE IF NOT EXISTS pricing_snapshots (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id              INTEGER NOT NULL REFERENCES models(id),
  snapshot_date         TEXT NOT NULL,
  prompt_usd_per_1k     REAL,
  completion_usd_per_1k REAL,
  source                TEXT NOT NULL DEFAULT 'openrouter',
  raw_json              TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(model_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pricing_model_date ON pricing_snapshots(model_id, snapshot_date);

CREATE TABLE IF NOT EXISTS performance_metrics (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id              INTEGER NOT NULL REFERENCES models(id) UNIQUE,
  quality_score_overall REAL NOT NULL DEFAULT 0.5,
  latency_p50_ms        INTEGER,
  latency_p95_ms        INTEGER,
  error_rate            REAL,
  notes                 TEXT,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS policies (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  name                          TEXT NOT NULL UNIQUE,
  optimize_for                  TEXT NOT NULL DEFAULT 'balanced',
  weight_cost                   REAL NOT NULL DEFAULT 0.33,
  weight_quality                REAL NOT NULL DEFAULT 0.33,
  weight_latency                REAL NOT NULL DEFAULT 0.33,
  min_quality                   REAL,
  max_estimated_request_cost_usd REAL,
  max_output_tokens             INTEGER,
  allowed_providers             TEXT,
  blocked_models                TEXT,
  fallback_count                INTEGER NOT NULL DEFAULT 2,
  is_default                    INTEGER NOT NULL DEFAULT 0,
  updated_at                    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed: default policies
INSERT OR IGNORE INTO policies
  (name, optimize_for, weight_cost, weight_quality, weight_latency, is_default)
VALUES
  ('balanced',        'balanced',        0.33, 0.33, 0.33, 1),
  ('cheapest',        'lowest_cost',     0.80, 0.10, 0.10, 0),
  ('highest_quality', 'highest_quality', 0.10, 0.80, 0.10, 0);

-- Seed: sample models (useful before first OpenRouter sync)
INSERT OR IGNORE INTO models
  (provider, provider_model_id, openrouter_model_id, display_name)
VALUES
  ('openai',    'gpt-4o',                        'openai/gpt-4o',                  'GPT-4o'),
  ('openai',    'gpt-4o-mini',                   'openai/gpt-4o-mini',             'GPT-4o Mini'),
  ('anthropic', 'claude-3-5-sonnet-20241022',    'anthropic/claude-3.5-sonnet',    'Claude 3.5 Sonnet'),
  ('anthropic', 'claude-3-haiku-20240307',       'anthropic/claude-3-haiku',       'Claude 3 Haiku'),
  ('google',    'gemini-1.5-pro',                'google/gemini-pro-1.5',          'Gemini 1.5 Pro'),
  ('deepseek',  'deepseek-chat',                 'deepseek/deepseek-chat',         'DeepSeek Chat');
