import { AI_PROVIDERS } from '../core/Constants.js';
import { logger } from '../infrastructure/logger.js';

export class OpenRouterModelsService {
  constructor(fetchImpl = fetch) {
    this.fetch = fetchImpl;
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
      model?.metrics?.latency,
      model?.top_provider?.latency,
      model?.performance?.latency,
      model?.latency
    ];

    for (const value of candidates) {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }

    return null;
  }
}
