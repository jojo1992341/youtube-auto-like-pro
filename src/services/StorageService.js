import { STORAGE_KEYS, DEFAULTS } from '../core/Constants.js';
import { logger } from '../infrastructure/logger.js';

/**
 * SERVICE DE STOCKAGE (SINGLETON)
 * 
 * Améliorations v5.1 :
 * - API entièrement asynchrone pour éliminer les race conditions
 * - Gestion d'erreur avec feedback utilisateur
 * - Protection contre les accès avant initialisation
 * 
 * PRINCIPE :
 * - Toutes les méthodes sont maintenant async
 * - Le cache est mis à jour de manière optimiste
 * - Les erreurs de persistance sont propagées au lieu d'être silencieuses
 */
export class StorageService {
  constructor() {
    this._cache = {
      config: structuredClone(DEFAULTS.CONFIG),
      stats: structuredClone(DEFAULTS.STATS),
      history: []
    };

    this._isReady = false;
    this._initPromise = null;
  }

  /**
   * Initialise le service. Idempotent et thread-safe.
   * 
   * @returns {Promise<void>}
   */
  async init() {
    if (this._isReady) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        const data = await this._loadFromDisk();

        // Hydratation défensive avec fusion intelligente
        const loadedConfig = data[STORAGE_KEYS.CONFIG] || {};

        this._cache.config = {
          ...DEFAULTS.CONFIG,
          ...loadedConfig
        };

        // GARANTIE : On s'assure que customSelectors est bien fusionné (Deep merge partiel)
        // Cela évite d'avoir "undefined" si l'utilisateur vient d'une version sans cette fonctionnalité
        this._cache.config.customSelectors = {
          ...DEFAULTS.CONFIG.customSelectors,
          ...(loadedConfig.customSelectors || {})
        };

        this._cache.stats = { ...DEFAULTS.STATS, ...(data[STORAGE_KEYS.STATS] || {}) };

        const storedHistory = data[STORAGE_KEYS.HISTORY];
        this._cache.history = Array.isArray(storedHistory) ? storedHistory : [];

        this._isReady = true;
        this._watchForExternalChanges();

        logger.info('[StorageService] Initialisé avec succès.');
        logger.debug('[StorageService] Config chargée:', this._cache.config);

      } catch (e) {
        logger.error('[StorageService] Échec critique de l\'initialisation.', e);
        // On ne bloque pas l'extension, on tourne sur les defaults
        this._isReady = true;
      }
    })();

    return this._initPromise;
  }

  // ===========================================================================
  // ACCESSORS (Lecture Asynchrone)
  // ===========================================================================

  /**
   * Récupère la configuration actuelle.
   * Attend automatiquement la fin de l'initialisation si nécessaire.
   */
  async getConfig() {
    await this._ensureReady();
    return this._cache.config;
  }

  /**
   * Récupère les statistiques actuelles.
   */
  async getStats() {
    await this._ensureReady();
    return this._cache.stats;
  }

  /**
   * Récupère l'historique actuel.
   */
  async getHistory() {
    await this._ensureReady();
    return this._cache.history;
  }

  /**
   * Accesseurs synchrones pour compatibilité avec l'ancien code.
   * @deprecated Utilisez les versions async (getConfig, getStats, getHistory)
   */
  get config() {
    if (!this._isReady) {
      logger.warn('[StorageService] Accès synchrone avant initialisation. Utilisez await getConfig().');
      return this._cache.config; // Retourne les defaults en attendant
    }
    return this._cache.config;
  }

  get stats() {
    if (!this._isReady) {
      logger.warn('[StorageService] Accès synchrone avant initialisation. Utilisez await getStats().');
      return this._cache.stats;
    }
    return this._cache.stats;
  }

  get history() {
    if (!this._isReady) {
      logger.warn('[StorageService] Accès synchrone avant initialisation. Utilisez await getHistory().');
      return this._cache.history;
    }
    return this._cache.history;
  }

  // ===========================================================================
  // MUTATORS (Écriture Asynchrone)
  // ===========================================================================

  /**
   * Met à jour partiellement la configuration.
   * 
   * @param {Object} partialConfig 
   * @throws {Error} Si la sauvegarde échoue
   */
  async updateConfig(partialConfig) {
    await this._ensureReady();

    const newConfig = { ...this._cache.config, ...partialConfig };

    // 1. Mise à jour optimiste du cache
    this._cache.config = newConfig;

    // 2. Persistance (avec propagation des erreurs)
    try {
      await this._save(STORAGE_KEYS.CONFIG, newConfig);
      logger.info('[StorageService] Config mise à jour.', partialConfig);
    } catch (error) {
      // Rollback du cache en cas d'échec
      logger.error('[StorageService] Échec de la sauvegarde, rollback.', error);
      this._cache.config = { ...this._cache.config, ...this._getConfigFromDisk() };
      throw error; // Propager pour que l'appelant puisse réagir
    }
  }

  /**
   * Helper pour sauvegarder spécifiquement les sélecteurs personnalisés.
   * 
   * @param {Object} selectors - { likeButton: string|null, channelName: string|null }
   */
  async saveCustomSelectors(selectors) {
    await this._ensureReady();

    const currentSelectors = this._cache.config.customSelectors || {};
    const newSelectors = {
      ...currentSelectors,
      ...selectors
    };

    await this.updateConfig({ customSelectors: newSelectors });
    logger.info('[StorageService] Sélecteurs personnalisés sauvegardés.', newSelectors);
  }

  /**
   * Incrémente un compteur de statistiques.
   * 
   * @param {'auto'|'manual'|'skipped'} type 
   * @returns {Promise<void>}
   */
  async incrementStat(type) {
    await this._ensureReady();

    if (!Object.prototype.hasOwnProperty.call(this._cache.stats, type)) {
      logger.warn(`[StorageService] Tentative d'incrémenter une stat inconnue : ${type}`);
      return;
    }

    // Mise à jour atomique locale
    this._cache.stats[type]++;
    this._cache.stats.total++;

    // Sauvegarde avec gestion d'erreur
    try {
      await this._save(STORAGE_KEYS.STATS, this._cache.stats);
    } catch (error) {
      logger.error('[StorageService] Échec sauvegarde stats', error);
      // On ne rollback pas les stats car elles sont moins critiques
      // On log juste l'erreur
    }
  }

  /**
   * Ajoute une entrée à l'historique.
   * 
   * @param {Object} entry - { videoId, channelName, videoTitle, timestamp, action }
   */
  async addToHistory(entry) {
    await this._ensureReady();

    if (!entry || !entry.videoId) {
      logger.warn('[StorageService] Tentative d\'ajout d\'une entrée invalide à l\'historique.');
      return;
    }

    // Gestion de la taille max (LIFO)
    const newHistory = [entry, ...this._cache.history].slice(0, DEFAULTS.HISTORY_MAX_ITEMS);

    this._cache.history = newHistory;

    try {
      await this._save(STORAGE_KEYS.HISTORY, newHistory);
    } catch (error) {
      logger.error('[StorageService] Échec sauvegarde historique', error);
    }
  }

  /**
   * Réinitialise les statistiques aux valeurs par défaut.
   */
  async resetStats() {
    await this._ensureReady();

    this._cache.stats = structuredClone(DEFAULTS.STATS);

    try {
      await this._save(STORAGE_KEYS.STATS, this._cache.stats);
      logger.info('[StorageService] Statistiques réinitialisées.');
    } catch (error) {
      logger.error('[StorageService] Échec réinitialisation stats', error);
      throw error;
    }
  }

  // ===========================================================================
  // PRIVATE INFRASTRUCTURE
  // ===========================================================================

  /**
   * Attend activement la fin de l'initialisation.
   * @private
   */
  async _ensureReady() {
    if (this._isReady) return;

    if (this._initPromise) {
      await this._initPromise;
      return;
    }

    // Initialisation implicite en dernier recours
    logger.warn('[StorageService] Initialisation implicite. Appelez init() explicitement.');
    await this.init();
  }

  /**
   * Wrapper Promise autour de chrome.storage.local.get
   * @private
   */
  _loadFromDisk() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(result || {});
      });
    });
  }

  /**
   * Récupère uniquement la config depuis le disque (pour rollback).
   * @private
   */
  async _getConfigFromDisk() {
    try {
      const data = await this._loadFromDisk();
      return data[STORAGE_KEYS.CONFIG] || DEFAULTS.CONFIG;
    } catch {
      return DEFAULTS.CONFIG;
    }
  }

  /**
   * Wrapper Promise autour de chrome.storage.local.set
   * @private
   */
  _save(key, value) {
    return new Promise((resolve, reject) => {
      const payload = { [key]: value };
      chrome.storage.local.set(payload, () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }

  // ... (méthodes privées inchangées)

  _watchForExternalChanges() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes[STORAGE_KEYS.CONFIG]) {
        const newVal = changes[STORAGE_KEYS.CONFIG].newValue;
        if (newVal) {
          this._cache.config = { ...this._cache.config, ...newVal };
          logger.debug('[StorageService] Sync config depuis storage externe');
        }
      }
    });
  }
}
