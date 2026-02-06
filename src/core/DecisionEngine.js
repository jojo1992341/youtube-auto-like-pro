import { LIMITS } from './Constants.js';

/**
 * ENUM: TYPES D'ACTIONS POSSIBLES
 */
export const DECISION = Object.freeze({
  LIKE: 'DECISION_LIKE',
  SKIP: 'DECISION_SKIP',
  ASK_CONSENT: 'DECISION_ASK',
  DO_NOTHING: 'DECISION_NONE'
});

/**
 * MOTEUR DE DÉCISION
 * Module pur sans effets de bord.
 * 
 * Améliorations v5.1 :
 * - Normalisation Unicode des noms de chaînes
 * - Comparaison insensible à la casse
 * - Suppression des caractères invisibles
 */
export class DecisionEngine {
  constructor(config) {
    if (!config) {
      throw new Error('[DecisionEngine] Impossible d\'instancier sans configuration.');
    }
    this.config = config;
    
    // Pré-normalisation des listes pour optimiser les comparaisons
    this._normalizedWhitelist = this._normalizeList(config.whitelist || []);
    this._normalizedBlacklist = this._normalizeList(config.blacklist || []);
  }

  /**
   * Détermine l'action à entreprendre pour une chaîne donnée.
   * 
   * @param {string} rawChannelName - Nom brut extrait du DOM
   * @returns {string} Une valeur de l'enum DECISION
   */
  decide(rawChannelName) {
    // 1. Validation stricte de l'entrée
    if (!rawChannelName || typeof rawChannelName !== 'string') {
      return DECISION.DO_NOTHING;
    }

    // 2. Normalisation robuste
    const channelName = this._normalizeChannelName(rawChannelName);
    
    if (!channelName) {
      return DECISION.DO_NOTHING;
    }

    // 3. BLACKLIST (Priorité Absolue)
    if (this._normalizedBlacklist.includes(channelName)) {
      return DECISION.SKIP;
    }

    // 4. WHITELIST (Automatisation)
    if (this._normalizedWhitelist.includes(channelName)) {
      return DECISION.LIKE;
    }

    // 5. DEFAUT (Inconnu)
    return DECISION.ASK_CONSENT;
  }

  /**
   * Calcule le délai d'attente avant action avec variation aléatoire.
   * 
   * @returns {number} Délai en millisecondes (toujours positif)
   */
  computeDelayMs() {
    const baseDelaySec = this.config.baseDelay ?? 10;
    const variationPercent = this.config.variationPercent ?? 0;

    const baseMs = baseDelaySec * 1000;

    if (variationPercent <= 0) {
      return this._clampDelay(baseMs);
    }

    // Calcul de la variation : facteur entre -variation% et +variation%
    const maxDeviation = (variationPercent / 100);
    const randomFactor = (Math.random() * 2 * maxDeviation) - maxDeviation;
    
    const finalDelay = baseMs + (baseMs * randomFactor);

    return this._clampDelay(Math.round(finalDelay));
  }

  /**
   * Normalise un nom de chaîne pour comparaison robuste.
   * @private
   */
  _normalizeChannelName(name) {
    if (!name || typeof name !== 'string') {
      return null;
    }
    
    return name
      .trim()
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars
      .replace(/\s+/g, ' ') // Normaliser les espaces multiples
      .normalize('NFC') // Normalisation Unicode (forme canonique)
      .toLowerCase();
  }

  /**
   * Normalise une liste de noms de chaînes.
   * @private
   */
  _normalizeList(list) {
    if (!Array.isArray(list)) {
      return [];
    }
    
    return list
      .map(name => this._normalizeChannelName(name))
      .filter(Boolean); // Supprimer les valeurs null/undefined
  }

  /**
   * Borne le délai dans les limites techniques autorisées.
   * @private
   */
  _clampDelay(ms) {
    const min = 0;
    const max = (LIMITS.DELAY?.MAX || 600) * 1000;
    return Math.max(min, Math.min(ms, max));
  }
}
