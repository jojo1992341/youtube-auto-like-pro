import { AI_PROVIDERS } from '../core/Constants.js';
import { logger } from '../infrastructure/logger.js';

export class GroqModelsService {
  constructor(fetchImpl = fetch) {
    this.fetch = (...args) => fetchImpl(...args);
  }

  async listModels(apiKey) {
    if (!apiKey) {
      throw new Error('Clé API Groq requise pour lister les modèles.');
    }

    const response = await this.fetch(`${AI_PROVIDERS.GROQ.BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Groq models error: ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));
    const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];

    const normalized = models
      .map((model) => ({
        id: model.id,
        name: model.name || model.id,
        latencyMs: null
      }))
      .filter((model) => model.id);

    normalized.sort((a, b) => a.id.localeCompare(b.id));
    logger.info(`[GroqModels] ${normalized.length} modèles récupérés.`);
    return normalized;
  }
}
