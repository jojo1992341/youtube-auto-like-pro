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
  HISTORY: 'alp_history_v5',
  // Nouvelle clé dédiée pour isoler la config IA (Sécurité & Modularité)
  AI_CONFIG: 'alp_ai_config_v1'
});

export const MESSAGES = Object.freeze({
  EVT_STATS_UPDATED: 'EVT_STATS_UPDATED',
  // Commandes pour le mode de sélection manuel
  START_SELECTION_MODE: 'MSG_START_SELECTION_MODE',
  SELECTION_COMPLETED: 'MSG_SELECTION_COMPLETED',
  START_DIAGNOSTIC: 'MSG_START_DIAGNOSTIC',
  // Commandes IA (Asynchrone via Service Worker)
  AI_GENERATE_REQUEST: 'MSG_AI_GENERATE_REQUEST',
  AI_GENERATE_SUCCESS: 'MSG_AI_GENERATE_SUCCESS',
  AI_GENERATE_ERROR: 'MSG_AI_GENERATE_ERROR'
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
    customSelectors: {
      likeButton: null,
      channelName: null
    }
  },
  // Configuration par défaut pour le module IA
  AI_CONFIG: {
    isEnabled: false, // Sécurité par défaut : désactivé
    provider: 'openrouter',
    apiKey: '', // L'utilisateur DOIT fournir sa clé
    // Modèle gratuit performant par défaut sur OpenRouter
    model: 'google/gemini-2.0-flash-lite-preview-02-05:free',
    // Prompt système par défaut : concis, positif, engageant
    systemPrompt: 'Tu es un viewer abonné à cette chaîne. Rédige un commentaire court (max 2 phrases), positif, constructif et pertinent par rapport au titre de la vidéo. Reste naturel, pas de hashtag abusif.',
    temperature: 0.7,
    maxSuggestions: 5 // Nombre de variantes générées
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
  },
  // Limites techniques pour l'IA
  AI: {
    // Augmenté pour supporter le batch de 5 commentaires (JSON Array)
    MAX_TOKENS: 700, 
    // Augmenté car l'inférence de 5 items est plus longue
    TIMEOUT_MS: 30000 
  }
});

export const AI_PROVIDERS = Object.freeze({
  OPENROUTER: {
    NAME: 'OpenRouter',
    BASE_URL: 'https://openrouter.ai/api/v1',
    HEADERS_REFERER: 'https://github.com/autolike-pro', // Requis par OpenRouter
    HEADERS_TITLE: 'YouTube AutoLike Pro' // Requis par OpenRouter
  }
});