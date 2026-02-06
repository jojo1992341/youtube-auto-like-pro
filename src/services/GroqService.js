import { AI_PROVIDERS, LIMITS } from '../core/Constants.js';
import { logger } from '../infrastructure/logger.js';

/**
 * SERVICE GROQ
 * Responsabilité : Gérer la communication avec l'API Groq (compatible OpenAI).
 */
export class GroqService {
  async generateComment({ apiKey, model, systemPrompt, videoTitle, channelName, extraInstructions = '', transcript = '' }) {
    if (!apiKey) {
      throw new Error('Clé API Groq manquante. Configurez-la dans les options.');
    }
    if (!videoTitle || !channelName) {
      throw new Error('Contexte vidéo insuffisant pour générer un commentaire.');
    }

    const userMessage = `
      Contexte :
      - Chaîne : "${channelName}"
      - Vidéo : "${videoTitle}"

      ${extraInstructions ? `Précisions additionnelles : "${extraInstructions}"` : ''}
      ${transcript ? `Transcription (extrait brut) : "${transcript}"` : ''}

      Tâche : Rédige 5 variantes distinctes de commentaires (courts, positifs, pertinents).

      FORMAT DE RÉPONSE OBLIGATOIRE :
      Tu dois répondre UNIQUEMENT avec un tableau JSON de chaînes de caractères.
      Exemple : ["Commentaire 1", "Commentaire 2", "Commentaire 3", "Commentaire 4", "Commentaire 5"]

      Interdiction d'ajouter du texte avant ou après le JSON.
    `.trim();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIMITS.AI.TIMEOUT_MS);

    try {
      logger.debug(`[Groq] Envoi requête Batch-5 (${model})...`);

      const response = await fetch(`${AI_PROVIDERS.GROQ.BASE_URL}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: LIMITS.AI.MAX_TOKENS
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMsg = errorBody.error?.message || `Erreur HTTP ${response.status}`;

        if (response.status === 401) throw new Error('Clé API Groq invalide.');
        if (response.status === 402) throw new Error('Crédits insuffisants (Quota dépassé).');

        throw new Error(`Groq Error: ${errorMsg}`);
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('Réponse vide de l\'IA.');
      }

      const rawContent = data.choices[0].message.content;
      return this._parseResponse(rawContent);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Délai d\'attente dépassé (Timeout).');
      }

      logger.error('[Groq] Échec génération', error);
      throw error;
    }
  }

  _parseResponse(rawContent) {
    try {
      let cleaned = rawContent.trim();

      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
      cleaned = cleaned.replace(/\s*```$/, '');

      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed)) {
        return parsed.map(String).slice(0, 5);
      }

      logger.warn('[Groq] Réponse non-tableau, conversion fallback.');
      return [String(rawContent)];
    } catch (e) {
      logger.warn('[Groq] Echec parsing JSON. Retour brut.', e);
      return [rawContent];
    }
  }
}
