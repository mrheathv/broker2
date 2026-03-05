'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { api, Policy } from '@/lib/api';

const OPTIMIZE_OPTIONS = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'lowest_cost', label: 'Lowest Cost' },
  { value: 'highest_quality', label: 'Highest Quality' },
  { value: 'lowest_latency', label: 'Lowest Latency' },
];

type PolicyForm = Omit<Policy, 'id' | 'updated_at' | 'allowed_providers' | 'blocked_models'> & {
  allowed_providers_str: string;
  blocked_models_str: string;
};

function policyToForm(p: Policy): PolicyForm {
  return {
    name: p.name,
    optimize_for: p.optimize_for,
    weight_cost: p.weight_cost,
    weight_quality: p.weight_quality,
    weight_latency: p.weight_latency,
    min_quality: p.min_quality,
    max_estimated_request_cost_usd: p.max_estimated_request_cost_usd,
    max_output_tokens: p.max_output_tokens,
    fallback_count: p.fallback_count,
    is_default: p.is_default,
    allowed_providers_str: p.allowed_providers?.join(', ') ?? '',
    blocked_models_str: p.blocked_models?.join(', ') ?? '',
  };
}

function formToPayload(f: PolicyForm): Omit<Policy, 'id' | 'updated_at'> {
  const parseList = (s: string) => {
    const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts : null;
  };
  return {
    name: f.name.trim(),
    optimize_for: f.optimize_for,
    weight_cost: Number(f.weight_cost),
    weight_quality: Number(f.weight_quality),
    weight_latency: Number(f.weight_latency),
    min_quality: f.min_quality != null && f.min_quality !== (null as unknown as number) ? Number(f.min_quality) : null,
    max_estimated_request_cost_usd:
      f.max_estimated_request_cost_usd != null ? Number(f.max_estimated_request_cost_usd) : null,
    max_output_tokens: f.max_output_tokens != null ? Number(f.max_output_tokens) : null,
    fallback_count: Number(f.fallback_count),
    is_default: Boolean(f.is_default),
    allowed_providers: parseList(f.allowed_providers_str),
    blocked_models: parseList(f.blocked_models_str),
  };
}

function emptyForm(): PolicyForm {
  return {
    name: '',
    optimize_for: 'balanced',
    weight_cost: 0.33,
    weight_quality: 0.33,
    weight_latency: 0.33,
    min_quality: null,
    max_estimated_request_cost_usd: null,
    max_output_tokens: null,
    fallback_count: 2,
    is_default: false,
    allowed_providers_str: '',
    blocked_models_str: '',
  };
}

function PolicyFormFields({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  form: PolicyForm;
  onChange: (f: PolicyForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  const set = (key: keyof PolicyForm, value: unknown) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-800">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
        <input
          className="input"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          disabled={!isNew}
          placeholder="e.g. balanced"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Optimize For</label>
        <select
          className="input"
          value={form.optimize_for}
          onChange={(e) => set('optimize_for', e.target.value)}
        >
          {OPTIMIZE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Weight: Cost</label>
        <input className="input" type="number" min="0" max="1" step="0.01"
          value={form.weight_cost} onChange={(e) => set('weight_cost', e.target.value)} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Weight: Quality</label>
        <input className="input" type="number" min="0" max="1" step="0.01"
          value={form.weight_quality} onChange={(e) => set('weight_quality', e.target.value)} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Weight: Latency</label>
        <input className="input" type="number" min="0" max="1" step="0.01"
          value={form.weight_latency} onChange={(e) => set('weight_latency', e.target.value)} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Min Quality (0–1, optional)</label>
        <input className="input" type="number" min="0" max="1" step="0.01"
          placeholder="—"
          value={form.min_quality ?? ''}
          onChange={(e) => set('min_quality', e.target.value === '' ? null : parseFloat(e.target.value))} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Max Request Cost USD (optional)</label>
        <input className="input" type="number" min="0" step="0.0001"
          placeholder="—"
          value={form.max_estimated_request_cost_usd ?? ''}
          onChange={(e) => set('max_estimated_request_cost_usd', e.target.value === '' ? null : parseFloat(e.target.value))} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Max Output Tokens (optional)</label>
        <input className="input" type="number" min="1" step="1"
          placeholder="—"
          value={form.max_output_tokens ?? ''}
          onChange={(e) => set('max_output_tokens', e.target.value === '' ? null : parseInt(e.target.value))} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Fallback Count</label>
        <input className="input" type="number" min="0" max="10" step="1"
          value={form.fallback_count}
          onChange={(e) => set('fallback_count', parseInt(e.target.value))} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">
          Allowed Providers (comma-separated, empty = all)
        </label>
        <input className="input" type="text"
          placeholder="openai, anthropic, deepseek"
          value={form.allowed_providers_str}
          onChange={(e) => set('allowed_providers_str', e.target.value)} />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-400 mb-1">
          Blocked Models — provider_model_id (comma-separated)
        </label>
        <input className="input" type="text"
          placeholder="gpt-4o, claude-3-opus-20240229"
          value={form.blocked_models_str}
          onChange={(e) => set('blocked_models_str', e.target.value)} />
      </div>

      <div className="sm:col-span-2 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input type="checkbox"
            className="rounded border-gray-600"
            checked={form.is_default}
            onChange={(e) => set('is_default', e.target.checked)} />
          Set as default policy
        </label>
      </div>

      <div className="sm:col-span-2 flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
        <button onClick={onSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : isNew ? 'Create Policy' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [forms, setForms] = useState<Record<number, PolicyForm>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<PolicyForm>(emptyForm());
  const [savingNew, setSavingNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getPolicies();
      setPolicies(data);
      const initForms: Record<number, PolicyForm> = {};
      for (const p of data) initForms[p.id] = policyToForm(p);
      setForms(initForms);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(id: number) {
    setSaving((prev) => ({ ...prev, [id]: true }));
    try {
      await api.updatePolicy(id, formToPayload(forms[id]));
      setExpandedId(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleSetDefault(id: number) {
    try {
      await api.updatePolicy(id, { is_default: true });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleDelete(policy: Policy) {
    if (!confirm(`Delete policy "${policy.name}"? This cannot be undone.`)) return;
    try {
      await api.deletePolicy(policy.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleCreate() {
    setSavingNew(true);
    try {
      await api.createPolicy(formToPayload(newForm));
      setShowNew(false);
      setNewForm(emptyForm());
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <AuthGuard>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Policies</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Configure how the <code className="text-indigo-400">/api/select-model</code> endpoint picks models.
            </p>
          </div>
          <button onClick={() => { setShowNew(true); setExpandedId(null); }} className="btn-primary">
            + New Policy
          </button>
        </div>

        {error && <div className="card p-4 border-red-800 text-red-400 text-sm">{error}</div>}

        {/* New policy form */}
        {showNew && (
          <div className="card p-5 space-y-2">
            <h2 className="font-semibold text-gray-100">New Policy</h2>
            <PolicyFormFields
              form={newForm}
              onChange={setNewForm}
              onSave={handleCreate}
              onCancel={() => { setShowNew(false); setNewForm(emptyForm()); }}
              saving={savingNew}
              isNew
            />
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading…</div>
        ) : (
          <div className="space-y-3">
            {policies.length === 0 && (
              <div className="card p-10 text-center text-gray-500 text-sm">No policies yet.</div>
            )}
            {policies.map((p) => {
              const isExpanded = expandedId === p.id;
              const form = forms[p.id];
              return (
                <div key={p.id} className="card p-5">
                  {/* Policy header */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-100">{p.name}</span>
                      {p.is_default && (
                        <span className="rounded-full bg-indigo-900/60 px-2 py-0.5 text-xs text-indigo-300 border border-indigo-700">
                          default
                        </span>
                      )}
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                        {OPTIMIZE_OPTIONS.find((o) => o.value === p.optimize_for)?.label ?? p.optimize_for}
                      </span>
                      {p.min_quality != null && (
                        <span className="text-xs text-gray-500">min quality {p.min_quality}</span>
                      )}
                      {p.max_estimated_request_cost_usd != null && (
                        <span className="text-xs text-gray-500">
                          max cost ${p.max_estimated_request_cost_usd}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!p.is_default && (
                        <button onClick={() => handleSetDefault(p.id)} className="btn-secondary text-xs">
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setExpandedId(isExpanded ? null : p.id);
                          setShowNew(false);
                        }}
                        className="btn-secondary text-xs"
                      >
                        {isExpanded ? 'Cancel' : 'Edit'}
                      </button>
                      {!p.is_default && (
                        <button onClick={() => handleDelete(p)} className="btn-danger text-xs">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Weights summary */}
                  {!isExpanded && (
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                      <span>Cost weight: <span className="text-gray-300">{p.weight_cost}</span></span>
                      <span>Quality weight: <span className="text-gray-300">{p.weight_quality}</span></span>
                      <span>Latency weight: <span className="text-gray-300">{p.weight_latency}</span></span>
                      <span>Fallbacks: <span className="text-gray-300">{p.fallback_count}</span></span>
                      {p.allowed_providers?.length && (
                        <span>Providers: <span className="text-gray-300">{p.allowed_providers.join(', ')}</span></span>
                      )}
                      {p.blocked_models?.length && (
                        <span>Blocked: <span className="text-gray-300">{p.blocked_models.join(', ')}</span></span>
                      )}
                    </div>
                  )}

                  {/* Edit form */}
                  {isExpanded && form && (
                    <PolicyFormFields
                      form={form}
                      onChange={(f) => setForms((prev) => ({ ...prev, [p.id]: f }))}
                      onSave={() => handleSave(p.id)}
                      onCancel={() => setExpandedId(null)}
                      saving={saving[p.id] ?? false}
                      isNew={false}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
