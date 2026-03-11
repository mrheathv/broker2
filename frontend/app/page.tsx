'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, PublicPricingModel, SelectModelResponse } from '@/lib/api';

function fmt(val: number | null | undefined, decimals = 4): string {
  if (val == null) return '—';
  return `$${val.toFixed(decimals)}`;
}

function vsGpt4o(model: PublicPricingModel, gpt4oPrice: number | null): string {
  if (model.prompt_usd_per_1k == null || gpt4oPrice == null) return '—';
  if (model.provider === 'openai' && model.provider_model_id === 'gpt-4o') return 'baseline';
  const pct = ((model.prompt_usd_per_1k - gpt4oPrice) / gpt4oPrice) * 100;
  return pct < 0 ? `${pct.toFixed(0)}%` : `+${pct.toFixed(0)}%`;
}

const POLICIES = [
  { label: 'Cheapest', name: 'cheapest', desc: 'minimize cost' },
  { label: 'Balanced', name: 'balanced', desc: 'cost + quality + speed' },
  { label: 'Highest Quality', name: 'highest_quality', desc: 'best output' },
];

export default function LandingPage() {
  const [models, setModels] = useState<PublicPricingModel[]>([]);
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);

  const [promptTokens, setPromptTokens] = useState(1000);
  const [completionTokens, setCompletionTokens] = useState(500);
  const [policy, setPolicy] = useState('balanced');
  const [result, setResult] = useState<SelectModelResponse | null>(null);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState('');

  useEffect(() => {
    api
      .getPublicPricing()
      .then((d) => {
        setModels(d.models);
        setSnapshotDate(d.snapshotDate);
      })
      .catch(() => {})
      .finally(() => setLoadingPricing(false));
  }, []);

  const gpt4oPrice =
    models.find((m) => m.provider === 'openai' && m.provider_model_id === 'gpt-4o')
      ?.prompt_usd_per_1k ?? null;

  async function handleSelect() {
    setQuerying(true);
    setQueryError('');
    setResult(null);
    try {
      const r = await api.selectModel({
        policy_name: policy,
        estimated_prompt_tokens: promptTokens,
        estimated_completion_tokens: completionTokens,
      });
      setResult(r);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setQuerying(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top bar */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex h-14 items-center justify-between">
          <span className="text-base font-semibold text-indigo-400 tracking-tight">
            Model Board
          </span>
          <Link
            href="/admin"
            className="text-sm text-gray-400 hover:text-gray-100 transition-colors"
          >
            Admin →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 space-y-14">
        {/* Hero */}
        <section className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-100 leading-tight">
            Route every LLM call to the<br className="hidden sm:block" /> right model,
            automatically.
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl">
            Real-time pricing from OpenRouter. Configurable cost / quality / latency policies.
            One API call to get a ranked recommendation + fallbacks.
          </p>
        </section>

        {/* Live pricing table */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Live Pricing
            </h2>
            {snapshotDate && (
              <span className="text-xs text-gray-600">Updated {snapshotDate}</span>
            )}
          </div>
          <div className="card overflow-x-auto">
            {loadingPricing ? (
              <div className="py-12 text-center text-gray-500 text-sm">Loading…</div>
            ) : (
              <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
                  <tr>
                    <th className="th">Provider</th>
                    <th className="th">Model</th>
                    <th className="th text-right">Prompt $/1K</th>
                    <th className="th text-right">Completion $/1K</th>
                    <th className="th text-right">vs GPT-4o</th>
                    <th className="th text-right">Latency p50</th>
                    <th className="th text-right">Quality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {models.length === 0 && (
                    <tr>
                      <td colSpan={7} className="td text-center text-gray-500 py-10">
                        No pricing data yet.
                      </td>
                    </tr>
                  )}
                  {models.map((m) => {
                    const vs = vsGpt4o(m, gpt4oPrice);
                    const isBaseline = vs === 'baseline';
                    const isCheaper = vs.startsWith('-');
                    return (
                      <tr key={m.id} className="hover:bg-gray-800/40 transition-colors">
                        <td className="td">
                          <span className="inline-block rounded bg-gray-800 px-2 py-0.5 text-xs font-mono text-gray-300">
                            {m.provider}
                          </span>
                        </td>
                        <td className="td">
                          <div className="font-medium text-gray-100">{m.display_name}</div>
                          <div className="text-xs text-gray-500 font-mono">
                            {m.provider_model_id}
                          </div>
                        </td>
                        <td className="td text-right font-mono text-green-400">
                          {fmt(m.prompt_usd_per_1k)}
                        </td>
                        <td className="td text-right font-mono text-green-400">
                          {fmt(m.completion_usd_per_1k)}
                        </td>
                        <td
                          className={`td text-right font-mono font-semibold ${
                            isBaseline
                              ? 'text-gray-500'
                              : isCheaper
                              ? 'text-emerald-400'
                              : 'text-gray-400'
                          }`}
                        >
                          {vs}
                        </td>
                        <td className="td text-right font-mono text-gray-300">
                          {m.latency_p50_ms != null ? `${m.latency_p50_ms} ms` : '—'}
                        </td>
                        <td className="td text-right font-mono text-blue-400">
                          {m.quality_score_overall != null
                            ? (m.quality_score_overall * 100).toFixed(0) + '%'
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </section>

        {/* Try-it widget */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Try the Model Selector
          </h2>
          <div className="card p-6 space-y-5">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Prompt tokens</label>
                <input
                  type="number"
                  min={0}
                  className="input w-36"
                  value={promptTokens}
                  onChange={(e) => setPromptTokens(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Completion tokens</label>
                <input
                  type="number"
                  min={0}
                  className="input w-36"
                  value={completionTokens}
                  onChange={(e) => setCompletionTokens(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Policy</label>
              <div className="flex flex-wrap gap-2">
                {POLICIES.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setPolicy(p.name)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      policy === p.name
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {p.label}
                    <span className="ml-1.5 text-xs opacity-60">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSelect} disabled={querying} className="btn-primary">
              {querying ? 'Querying…' : '→ Find best model'}
            </button>

            {queryError && <p className="text-sm text-red-400">{queryError}</p>}

            {result && (
              <div className="border border-gray-700 rounded-lg p-4 space-y-3 bg-gray-900/60">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Recommended</div>
                    <div className="text-lg font-semibold text-indigo-300">
                      {result.selected.provider} / {result.selected.model}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-500 mb-0.5">Est. cost</div>
                    <div className="font-mono text-green-400 font-semibold">
                      ${result.selected.estimated_cost_usd.toFixed(6)}
                    </div>
                  </div>
                </div>

                {result.fallbacks.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5">Fallbacks</div>
                    <div className="space-y-1">
                      {result.fallbacks.map((f, i) => (
                        <div
                          key={i}
                          className="text-sm text-gray-400 font-mono flex justify-between gap-4"
                        >
                          <span>
                            {f.provider} / {f.model}
                          </span>
                          <span className="text-gray-600">${f.estimated_cost_usd.toFixed(6)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-600 pt-1 border-t border-gray-800">
                  Policy: {result.policy_used}
                  {result.snapshot_date && ` · Pricing from ${result.snapshot_date}`}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-800 pt-6 flex flex-wrap gap-2 text-xs text-gray-600">
          {['Cloudflare Workers', 'D1 (SQLite)', 'OpenRouter API', 'Next.js'].map((t) => (
            <span key={t} className="bg-gray-900 border border-gray-800 rounded px-2 py-1">
              {t}
            </span>
          ))}
        </footer>
      </main>
    </div>
  );
}
