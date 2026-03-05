'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { api, PerformanceRow } from '@/lib/api';

interface EditState {
  quality_score_overall: string;
  latency_p50_ms: string;
  latency_p95_ms: string;
  error_rate: string;
  notes: string;
}

function rowToEdit(row: PerformanceRow): EditState {
  return {
    quality_score_overall: row.quality_score_overall?.toString() ?? '0.5',
    latency_p50_ms: row.latency_p50_ms?.toString() ?? '',
    latency_p95_ms: row.latency_p95_ms?.toString() ?? '',
    error_rate: row.error_rate?.toString() ?? '',
    notes: row.notes ?? '',
  };
}

export default function PerformancePage() {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.getPerformance();
      setRows(data);
      const initEdits: Record<number, EditState> = {};
      for (const row of data) initEdits[row.model_id] = rowToEdit(row);
      setEdits(initEdits);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleChange(modelId: number, field: keyof EditState, value: string) {
    setEdits((prev) => ({ ...prev, [modelId]: { ...prev[modelId], [field]: value } }));
    setSaved((prev) => ({ ...prev, [modelId]: false }));
  }

  async function handleSave(modelId: number) {
    setSaving((prev) => ({ ...prev, [modelId]: true }));
    const e = edits[modelId];
    try {
      await api.upsertPerformance(modelId, {
        quality_score_overall: parseFloat(e.quality_score_overall) || 0.5,
        latency_p50_ms: e.latency_p50_ms !== '' ? parseInt(e.latency_p50_ms) : null,
        latency_p95_ms: e.latency_p95_ms !== '' ? parseInt(e.latency_p95_ms) : null,
        error_rate: e.error_rate !== '' ? parseFloat(e.error_rate) : null,
        notes: e.notes || null,
      });
      setSaved((prev) => ({ ...prev, [modelId]: true }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving((prev) => ({ ...prev, [modelId]: false }));
    }
  }

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Performance Board</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Edit quality scores, latency benchmarks, and error rates per model.
          </p>
        </div>

        {error && <div className="card p-4 border-red-800 text-red-400 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading…</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-gray-800">
                <tr>
                  <th className="th">Model</th>
                  <th className="th">Provider</th>
                  <th className="th">Quality (0–1)</th>
                  <th className="th">P50 Latency ms</th>
                  <th className="th">P95 Latency ms</th>
                  <th className="th">Error Rate (0–1)</th>
                  <th className="th">Notes</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="td text-center text-gray-500 py-10">
                      No active models found.
                    </td>
                  </tr>
                )}
                {rows.map((row) => {
                  const e = edits[row.model_id];
                  if (!e) return null;
                  const isSaving = saving[row.model_id];
                  const wasSaved = saved[row.model_id];

                  return (
                    <tr key={row.model_id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="td">
                        <div className="font-medium text-gray-100">{row.display_name}</div>
                        <div className="text-xs text-gray-500 font-mono">{row.provider_model_id}</div>
                      </td>
                      <td className="td">
                        <span className="inline-block rounded bg-gray-800 px-2 py-0.5 text-xs font-mono text-gray-300">
                          {row.provider}
                        </span>
                      </td>
                      <td className="td">
                        <input
                          className="input w-24"
                          type="number"
                          min="0" max="1" step="0.01"
                          value={e.quality_score_overall}
                          onChange={(ev) => handleChange(row.model_id, 'quality_score_overall', ev.target.value)}
                        />
                      </td>
                      <td className="td">
                        <input
                          className="input w-24"
                          type="number" min="0" step="1"
                          placeholder="—"
                          value={e.latency_p50_ms}
                          onChange={(ev) => handleChange(row.model_id, 'latency_p50_ms', ev.target.value)}
                        />
                      </td>
                      <td className="td">
                        <input
                          className="input w-24"
                          type="number" min="0" step="1"
                          placeholder="—"
                          value={e.latency_p95_ms}
                          onChange={(ev) => handleChange(row.model_id, 'latency_p95_ms', ev.target.value)}
                        />
                      </td>
                      <td className="td">
                        <input
                          className="input w-24"
                          type="number" min="0" max="1" step="0.001"
                          placeholder="—"
                          value={e.error_rate}
                          onChange={(ev) => handleChange(row.model_id, 'error_rate', ev.target.value)}
                        />
                      </td>
                      <td className="td">
                        <input
                          className="input w-40"
                          type="text"
                          placeholder="Optional notes"
                          value={e.notes}
                          onChange={(ev) => handleChange(row.model_id, 'notes', ev.target.value)}
                        />
                      </td>
                      <td className="td">
                        <button
                          onClick={() => handleSave(row.model_id)}
                          disabled={isSaving}
                          className={wasSaved ? 'btn-secondary text-green-400' : 'btn-primary'}
                        >
                          {isSaving ? 'Saving…' : wasSaved ? '✓ Saved' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
