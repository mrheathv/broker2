import { getToken, clearToken } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function request<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (requireAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublicPricingModel {
  id: number;
  provider: string;
  provider_model_id: string;
  display_name: string;
  prompt_usd_per_1k: number | null;
  completion_usd_per_1k: number | null;
  snapshot_date: string | null;
  latency_p50_ms: number | null;
  intelligence_index: number | null;
  coding_index: number | null;
}

export interface SelectModelResponse {
  selected: {
    provider: string;
    model: string;
    params: Record<string, number>;
    estimated_cost_usd: number;
  };
  fallbacks: Array<{
    provider: string;
    model: string;
    params: Record<string, number>;
    estimated_cost_usd: number;
  }>;
  snapshot_date: string | null;
  policy_used: string;
}

export interface Model {
  id: number;
  provider: string;
  provider_model_id: string;
  openrouter_model_id: string | null;
  display_name: string;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardModel {
  id: number;
  provider: string;
  providerModelId: string;
  displayName: string;
  isActive: boolean;
  snapshotDate: string | null;
  promptUsdPer1k: number | null;
  completionUsdPer1k: number | null;
  qualityScore: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  errorRate: number | null;
  estimatedRefCostUsd: number | null;
  policyScore: number | null;
}

export interface DashboardData {
  snapshotDate: string | null;
  defaultPolicy: string | null;
  refTokens: { prompt: number; completion: number };
  models: DashboardModel[];
}

export interface PerformanceRow {
  id: number;
  model_id: number;
  quality_score_overall: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  error_rate: number | null;
  notes: string | null;
  updated_at: string;
  provider: string;
  provider_model_id: string;
  display_name: string;
}

export interface Policy {
  id: number;
  name: string;
  optimize_for: string;
  weight_cost: number;
  weight_quality: number;
  weight_latency: number;
  min_quality: number | null;
  max_estimated_request_cost_usd: number | null;
  max_output_tokens: number | null;
  allowed_providers: string[] | null;
  blocked_models: string[] | null;
  fallback_count: number;
  is_default: boolean;
  updated_at: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const api = {
  // Auth check
  async checkAuth(): Promise<boolean> {
    try {
      await request('/api/dashboard', {}, true);
      return true;
    } catch {
      return false;
    }
  },

  // Dashboard
  getDashboard: () => request<DashboardData>('/api/dashboard'),

  // Models
  getModels: () => request<Model[]>('/api/admin/models'),
  updateModel: (id: number, data: Partial<Pick<Model, 'is_active' | 'display_name' | 'provider_model_id'>>) =>
    request<Model>(`/api/admin/models/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Performance
  getPerformance: () => request<PerformanceRow[]>('/api/admin/performance'),
  upsertPerformance: (
    modelId: number,
    data: Partial<Pick<PerformanceRow, 'quality_score_overall' | 'latency_p50_ms' | 'latency_p95_ms' | 'error_rate' | 'notes'>>
  ) =>
    request<PerformanceRow>(`/api/admin/performance/${modelId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Policies
  getPolicies: () => request<Policy[]>('/api/admin/policies'),
  createPolicy: (data: Omit<Policy, 'id' | 'updated_at'>) =>
    request<Policy>('/api/admin/policies', { method: 'POST', body: JSON.stringify(data) }),
  updatePolicy: (id: number, data: Partial<Omit<Policy, 'id' | 'updated_at'>>) =>
    request<Policy>(`/api/admin/policies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePolicy: (id: number) =>
    request<{ success: boolean }>(`/api/admin/policies/${id}`, { method: 'DELETE' }),

  // Jobs
  syncPricing: () =>
    request<{ synced: number; errors: string[]; date: string }>('/api/jobs/pricing-ingest', {
      method: 'POST',
    }),

  // Public (no auth)
  getPublicPricing: () =>
    request<{ models: PublicPricingModel[]; snapshotDate: string | null }>(
      '/api/public/pricing',
      {},
      false
    ),
  selectModel: (data: {
    policy_name?: string;
    estimated_prompt_tokens: number;
    estimated_completion_tokens: number;
  }) =>
    request<SelectModelResponse>(
      '/api/select-model',
      { method: 'POST', body: JSON.stringify(data) },
      false
    ),
};
