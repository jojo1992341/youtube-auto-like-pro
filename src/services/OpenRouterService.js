import { AI_PROVIDERS, LIMITS } from '../core/Constants.js';
import { logger } from '../infrastructure/logger.js';

/**
 * SERVICE OPENROUTER
 * Responsabilité : Gérer la communication bas niveau avec l'API OpenRouter.
 * - Validation des paramètres
 * - Construction des headers spécifiques
 * - Gestion des timeouts et erreurs HTTP
 * - Nettoyage et Parsing de la réponse (JSON Array)
 */
export class OpenRouterService {
  
  /**
   * Génère plusieurs variantes de commentaires via l'API.
   * 
   * @param {Object} params
   * @param {string} params.apiKey - La clé API de l'utilisateur
   * @param {string} params.model - Le modèle à utiliser
   * @param {string} params.systemPrompt - Les instructions de personnalité
   * @param {string} params.videoTitle - Le titre de la vidéo contextuelle
   * @param {string} params.channelName - Le nom de la chaîne
   * @returns {Promise<string[]>} Un tableau de 5 suggestions de commentaires
   */
  async generateComment({ apiKey, model, systemPrompt, videoTitle, channelName, extraInstructions = '', transcript = '' }) {
    // 1. Validation défensive
    if (!apiKey) {
      throw new Error('Clé API manquante. Configurez-la dans les options.');
    }
    if (!videoTitle || !channelName) {
      throw new Error('Contexte vidéo insuffisant pour générer un commentaire.');
    }

    // 2. Construction du Prompt "One-Shot" pour forcer le JSON
    // On demande explicitement 5 variantes dans un format machine-readable.
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

    // 3. Préparation de la requête
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIMITS.AI.TIMEOUT_MS);

    try {
      logger.debug(`[OpenRouter] Envoi requête Batch-5 (${model})...`);

      const response = await fetch(`${AI_PROVIDERS.OPENROUTER.BASE_URL}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': AI_PROVIDERS.OPENROUTER.HEADERS_REFERER,
          'X-Title': AI_PROVIDERS.OPENROUTER.HEADERS_TITLE
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          // On garde une température moyenne pour la variété créative
          temperature: 0.7,
          // Note: Il faudra augmenter MAX_TOKENS dans Constants.js pour supporter 5 commentaires
          max_tokens: LIMITS.AI.MAX_TOKENS 
        })
      });

      clearTimeout(timeoutId);

      // 4. Gestion des erreurs HTTP
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMsg = errorBody.error?.message || `Erreur HTTP ${response.status}`;
        
        if (response.status === 401) throw new Error('Clé API invalide.');
        if (response.status === 402) throw new Error('Crédits insuffisants (Quota dépassé).');
        
        throw new Error(`OpenRouter Error: ${errorMsg}`);
      }

      // 5. Parsing de la réponse
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
      
      logger.error('[OpenRouter] Échec génération', error);
      throw error;
    }
  }

  /**
   * Nettoie et parse la réponse brute de l'IA.
   * Gère les cas où l'IA entoure le JSON de Markdown (```json ... ```).
   * @private
   */
  _parseResponse(rawContent) {
    try {
      // Nettoyage des balises Markdown courantes
      let cleaned = rawContent.trim();
      
      // Enlever ```json au début et ``` à la fin
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
      cleaned = cleaned.replace(/\s*```$/, '');

      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed)) {
        // Filtrage simple pour s'assurer qu'on a bien des strings
        return parsed.map(String).slice(0, 5);
      } else {
        // Si c'est un objet ou autre chose, on tente de le convertir ou on wrap
        logger.warn('[OpenRouter] Réponse non-tableau, conversion fallback.');
        return [String(rawContent)];
      }

    } catch (e) {
      logger.warn('[OpenRouter] Echec parsing JSON. Retour brut.', e);
      // Fallback : Si l'IA n'a pas respecté le JSON, on renvoie le texte brut dans un tableau
      // On pourrait essayer de splitter par saut de ligne ici si nécessaire
      return [rawContent];
    }
  }
}
