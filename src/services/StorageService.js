import { STORAGE_KEYS, DEFAULTS } from '../core/Constants.js';
import { logger } from '../infrastructure/logger.js';

/**
 * SERVICE DE STOCKAGE (SINGLETON)
 * * Améliorations v5.4 (Support IA) :
 * - Gestion du store dédié à l'IA (AI_CONFIG)
 * - Séparation stricte des contextes pour la sécurité des clés API
 * - Principe de fusion sécurisée appliqué aux nouvelles configs
 */
export class StorageService {
  constructor() {
    this._cache = {
      config: structuredClone(DEFAULTS.CONFIG),
      stats: structuredClone(DEFAULTS.STATS),
      history: [],
      // Nouveau cache dédié pour l'IA
      aiConfig: structuredClone(DEFAULTS.AI_CONFIG)
    };

    this._isReady = false;
    this._initPromise = null;
  }

  /**
   * Initialise le service. Idempotent et thread-safe.
   * * @returns {Promise<void>}
   */
  async init() {
    if (this._isReady) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        const data = await this._loadFromDisk();

        // 1. Hydratation Config Cœur
        const loadedConfig = data[STORAGE_KEYS.CONFIG] || {};
        this._cache.config = {
          ...DEFAULTS.CONFIG,
          ...loadedConfig
        };
        // Merge spécifique pour les objets imbriqués (customSelectors)
        this._cache.config.customSelectors = {
          ...DEFAULTS.CONFIG.customSelectors,
          ...(loadedConfig.customSelectors || {})
        };

        // 2. Hydratation Config IA (NOUVEAU)
        // On fusionne avec les DEFAULTS pour garantir que tous les champs existent
        const loadedAI = data[STORAGE_KEYS.AI_CONFIG] || {};
        this._cache.aiConfig = {
          ...DEFAULTS.AI_CONFIG,
          ...loadedAI
        };

        // 3. Hydratation Stats & History
        this._cache.stats = { ...DEFAULTS.STATS, ...(data[STORAGE_KEYS.STATS] || {}) };
        const storedHistory = data[STORAGE_KEYS.HISTORY];
        this._cache.history = Array.isArray(storedHistory) ? storedHistory : [];

        this._isReady = true;
        this._watchForExternalChanges();

        logger.info('[StorageService] Initialisé avec succès (Module IA actif).');
        logger.debug('[StorageService] AI Config chargée:', this._cache.aiConfig);

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

  async getConfig() {
    await this._ensureReady();
    return this._cache.config;
  }

  /**
   * Récupère la configuration IA.
   * @returns {Promise<Object>}
   */
  async getAIConfig() {
    await this._ensureReady();
    return this._cache.aiConfig;
  }

  async getStats() {
    await this._ensureReady();
    return this._cache.stats;
  }

  async getHistory() {
    await this._ensureReady();
    return this._cache.history;
  }

  // ===========================================================================
  // MUTATORS (Écriture Asynchrone)
  // ===========================================================================

  async updateConfig(partialConfig) {
    await this._ensureReady();
    const newConfig = { ...this._cache.config, ...partialConfig };

    // Update Optimiste
    this._cache.config = newConfig;

    try {
      await this._save(STORAGE_KEYS.CONFIG, newConfig);
      logger.info('[StorageService] Config mise à jour.', partialConfig);
    } catch (error) {
      logger.error('[StorageService] Échec sauvegarde, rollback.', error);
      this._cache.config = { ...this._cache.config, ...await this._getFromDisk(STORAGE_KEYS.CONFIG, DEFAULTS.CONFIG) };
      throw error;
    }
  }

  /**
   * Met à jour la configuration IA.
   * @param {Object} partialAIConfig 
   */
  async updateAIConfig(partialAIConfig) {
    await this._ensureReady();
    const newAIConfig = { ...this._cache.aiConfig, ...partialAIConfig };

    // Update Optimiste
    this._cache.aiConfig = newAIConfig;

    try {
      await this._save(STORAGE_KEYS.AI_CONFIG, newAIConfig);
      logger.info('[StorageService] AI Config mise à jour.', Object.keys(partialAIConfig));
    } catch (error) {
      logger.error('[StorageService] Échec sauvegarde AI, rollback.', error);
      // Rollback via lecture disque
      this._cache.aiConfig = { 
        ...this._cache.aiConfig, 
        ...await this._getFromDisk(STORAGE_KEYS.AI_CONFIG, DEFAULTS.AI_CONFIG) 
      };
      throw error;
    }
  }

  async saveCustomSelectors(selectors) {
    await this._ensureReady();
    const currentSelectors = this._cache.config.customSelectors || {};
    const newSelectors = { ...currentSelectors, ...selectors };
    await this.updateConfig({ customSelectors: newSelectors });
  }

  async incrementStat(type) {
    await this._ensureReady();
    if (!Object.prototype.hasOwnProperty.call(this._cache.stats, type)) return;

    this._cache.stats[type]++;
    this._cache.stats.total++;

    try {
      await this._save(STORAGE_KEYS.STATS, this._cache.stats);
    } catch (error) {
      // Erreur non bloquante pour les stats
      logger.warn('[StorageService] Erreur mineure save stats', error);
    }
  }

  async addToHistory(entry) {
    await this._ensureReady();
    if (!entry || !entry.videoId) return;

    const newHistory = [entry, ...this._cache.history].slice(0, DEFAULTS.HISTORY_MAX_ITEMS);
    this._cache.history = newHistory;

    try {
      await this._save(STORAGE_KEYS.HISTORY, newHistory);
    } catch (error) {
      logger.warn('[StorageService] Erreur mineure save history', error);
    }
  }

  async resetStats() {
    await this._ensureReady();
    this._cache.stats = structuredClone(DEFAULTS.STATS);
    try {
      await this._save(STORAGE_KEYS.STATS, this._cache.stats);
    } catch (error) {
      throw error;
    }
  }

  // ===========================================================================
  // PRIVATE INFRASTRUCTURE
  // ===========================================================================

  async _ensureReady() {
    if (this._isReady) return;
    if (this._initPromise) {
      await this._initPromise;
      return;
    }
    // Fallback sécurité
    await this.init();
  }

  _loadFromDisk() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve(result || {});
      });
    });
  }

  async _getFromDisk(key, defaultValue) {
    try {
      const data = await this._loadFromDisk();
      return data[key] || defaultValue;
    } catch {
      return defaultValue;
    }
  }

  _save(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve();
      });
    });
  }

  _watchForExternalChanges() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes[STORAGE_KEYS.CONFIG]) {
        const newVal = changes[STORAGE_KEYS.CONFIG].newValue;
        if (newVal) this._cache.config = { ...this._cache.config, ...newVal };
      }

      // Ajout du watcher pour AI_CONFIG
      if (changes[STORAGE_KEYS.AI_CONFIG]) {
        const newVal = changes[STORAGE_KEYS.AI_CONFIG].newValue;
        if (newVal) {
          this._cache.aiConfig = { ...this._cache.aiConfig, ...newVal };
          logger.debug('[StorageService] Sync AI Config externe.');
        }
      }
    });
  }
}