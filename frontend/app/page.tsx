'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { api, DashboardModel, DashboardData } from '@/lib/api';

function fmt(val: number | null | undefined, decimals = 4): string {
  if (val == null) return '—';
  return `$${val.toFixed(decimals)}`;
}

function score(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toFixed(4);
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const d = await api.getDashboard();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const result = await api.syncPricing();
      setSyncMsg(`Synced ${result.synced} models for ${result.date}${result.errors.length ? ` (${result.errors.length} errors)` : ''}.`);
      await load();
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function toggleActive(model: DashboardModel) {
    try {
      await api.updateModel(model.id, { is_active: !model.isActive });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <AuthGuard>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Pricing Board</h1>
            {data && (
              <p className="text-sm text-gray-400 mt-0.5">
                {data.snapshotDate
                  ? `Latest snapshot: ${data.snapshotDate}`
                  : 'No pricing data yet — run a sync.'}
                {data.defaultPolicy && (
                  <span className="ml-3 text-gray-500">
                    Policy scores use: <span className="text-gray-300">{data.defaultPolicy}</span>
                    {' '}({data.refTokens.prompt}K prompt + {data.refTokens.completion / 1000 * 1000}K completion)
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {syncMsg && <span className="text-xs text-gray-400">{syncMsg}</span>}
            <button onClick={handleSync} disabled={syncing} className="btn-primary">
              {syncing ? 'Syncing…' : 'Sync Pricing Now'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="card p-4 border-red-800 text-red-400 text-sm">{error}</div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading…</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-gray-800">
                <tr>
                  <th className="th">Provider</th>
                  <th className="th">Model</th>
                  <th className="th text-right">Prompt $/1K</th>
                  <th className="th text-right">Completion $/1K</th>
                  <th className="th text-right">Quality</th>
                  <th className="th text-right">Policy Score</th>
                  <th className="th text-center">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {(data?.models ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="td text-center text-gray-500 py-10">
                      No models found. Run a pricing sync to populate.
                    </td>
                  </tr>
                )}
                {(data?.models ?? []).map((m) => (
                  <tr
                    key={m.id}
                    className={`hover:bg-gray-800/40 transition-colors ${!m.isActive ? 'opacity-40' : ''}`}
                  >
                    <td className="td">
                      <span className="inline-block rounded bg-gray-800 px-2 py-0.5 text-xs font-mono text-gray-300">
                        {m.provider}
                      </span>
                    </td>
                    <td className="td">
                      <div className="font-medium text-gray-100">{m.displayName}</div>
                      <div className="text-xs text-gray-500 font-mono">{m.providerModelId}</div>
                    </td>
                    <td className="td text-right font-mono text-green-400">
                      {fmt(m.promptUsdPer1k)}
                    </td>
                    <td className="td text-right font-mono text-green-400">
                      {fmt(m.completionUsdPer1k)}
                    </td>
                    <td className="td text-right font-mono">
                      {m.qualityScore != null ? m.qualityScore.toFixed(2) : '—'}
                    </td>
                    <td className="td text-right font-mono text-indigo-400">
                      {score(m.policyScore)}
                    </td>
                    <td className="td text-center">
                      <button
                        onClick={() => toggleActive(m)}
                        title={m.isActive ? 'Click to deactivate' : 'Click to activate'}
                        className={`w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          m.isActive ? 'bg-indigo-600' : 'bg-gray-700'
                        }`}
                      >
                        <span
                          className={`block h-4 w-4 mx-0.5 rounded-full bg-white transition-transform ${
                            m.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
