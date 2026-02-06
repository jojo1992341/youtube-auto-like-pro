import { AI_PROVIDERS } from '../core/Constants.js';
import { logger } from '../infrastructure/logger.js';

export class OpenRouterModelsService {
  constructor(fetchImpl = fetch) {
    this.fetch = (...args) => fetchImpl(...args);
  }

  async listFreeModels() {
    const response = await this.fetch(`${AI_PROVIDERS.OPENROUTER.BASE_URL}/models`);

    if (!response.ok) {
      throw new Error(`OpenRouter models error: ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));
    const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];

    const filtered = models
      .filter((model) => String(model?.id || '').includes(':free'))
      .map((model) => ({
        id: model.id,
        name: model.name || model.id,
        latencyMs: this._extractLatency(model)
      }))
      .filter((model) => model.id);

    const sorted = filtered.sort((a, b) => {
      const latencyA = Number.isFinite(a.latencyMs) ? a.latencyMs : Number.POSITIVE_INFINITY;
      const latencyB = Number.isFinite(b.latencyMs) ? b.latencyMs : Number.POSITIVE_INFINITY;
      if (latencyA === latencyB) {
        return a.id.localeCompare(b.id);
      }
      return latencyA - latencyB;
    });

    logger.info(`[OpenRouterModels] ${sorted.length} modèles :free récupérés.`);
    return sorted;
  }

  _extractLatency(model) {
    const candidates = [
      model?.metrics?.latency?.p50,
      model?.metrics?.latency?.p95,
      model?.metrics?.latency?.p90,
      model?.metrics?.latency?.p99,
      model?.metrics?.latency,
      model?.metrics?.latency_ms,
      model?.top_provider?.latency,
      model?.top_provider?.latency_ms,
      model?.top_provider?.metrics?.latency?.p50,
      model?.top_provider?.metrics?.latency?.p95,
      model?.performance?.latency,
      model?.latency,
      model?.latency_ms,
      ...this._extractProviderLatencies(model)
    ];

    for (const value of candidates) {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }

    return null;
  }

  _extractProviderLatencies(model) {
    const providers = Array.isArray(model?.providers) ? model.providers : [];
    if (!providers.length) return [];

    return providers.flatMap((provider) => ([
      provider?.latency,
      provider?.latency_ms,
      provider?.metrics?.latency?.p50,
      provider?.metrics?.latency?.p95,
      provider?.metrics?.latency,
      provider?.performance?.latency
    ]));
  }
}
