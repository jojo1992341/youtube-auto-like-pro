/**
 * SOURCE DE VÉRITÉ
 * Contient uniquement les valeurs immuables de l'application.
 * 
 * CONVENTION : Ce fichier utilise PascalCase (Constants.js)
 * Tous les imports doivent respecter cette casse exacte.
 */

export const STORAGE_KEYS = Object.freeze({
  CONFIG: 'alp_config_v5',
  STATS: 'alp_stats_v5',
  HISTORY: 'alp_history_v5'
});

export const MESSAGES = Object.freeze({
  EVT_STATS_UPDATED: 'EVT_STATS_UPDATED',
  // Commandes pour le mode de sélection manuel
  START_SELECTION_MODE: 'MSG_START_SELECTION_MODE',
  SELECTION_COMPLETED: 'MSG_SELECTION_COMPLETED',
  START_DIAGNOSTIC: 'MSG_START_DIAGNOSTIC'
});

export const DEFAULTS = Object.freeze({
  CONFIG: {
    isEnabled: true,
    baseDelay: 10,
    variationPercent: 30,
    logLevel: 'INFO',
    whitelist: [],
    blacklist: [],
    // Nouveaux champs pour stocker les sélecteurs manuels de l'utilisateur
    // null signifie "utiliser les sélecteurs par défaut de l'extension"
    customSelectors: {
      likeButton: null,
      channelName: null
    }
  },
  STATS: {
    total: 0,
    auto: 0,
    manual: 0,
    skipped: 0
  },
  HISTORY_MAX_ITEMS: 50
});

export const LIMITS = Object.freeze({
  DELAY: {
    MIN: 0,
    MAX: 600
  },
  VARIATION: {
    MIN: 0,
    MAX: 100
  }
});