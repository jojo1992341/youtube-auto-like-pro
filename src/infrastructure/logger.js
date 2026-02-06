const LEVELS = Object.freeze({
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
});

/**
 * LOGGER OPTIMISÉ (PERFORMANCE)
 * 
 * Modifications v5.3 :
 * - Cache local du niveau de log (entier) pour des vérifications instantanées (0ms).
 * - Suppression de la dépendance vers StorageService (lecture directe de chrome.storage).
 * - Écoute active des changements de configuration pour mise à jour à chaud.
 * - Réduit l'overhead CPU, crucial pour les événements rapides (mousemove, scroll).
 */
class Logger {
  constructor() {
    this.prefix = '👍 [AutoLike]';
    // Par défaut, on reste silencieux pour éviter de ralentir le démarrage
    // On passera au niveau utilisateur une fois la config chargée.
    this._level = LEVELS.WARN; 

    this._init();
  }

  /**
   * Initialisation autonome (sans dépendance externe).
   * @private
   */
  async _init() {
    // 1. Lecture initiale directe (rapide)
    try {
      // On utilise la clé "en dur" ici pour éviter d'importer Constants.js et créer une dépendance
      const key = 'alp_config_v5'; 
      const result = await new Promise(resolve => chrome.storage.local.get(key, resolve));
      
      if (result && result[key] && result[key].logLevel) {
        this.setLevel(result[key].logLevel);
      }
    } catch (e) {
      console.error('[Logger] Erreur lecture config initiale', e);
    }

    // 2. Écoute des mises à jour (Reactive)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.alp_config_v5) {
        const newValue = changes.alp_config_v5.newValue;
        if (newValue && newValue.logLevel) {
          this.setLevel(newValue.logLevel);
        }
      }
    });
  }

  /**
   * Met à jour le niveau de log interne (rapide).
   * @param {string} levelStr 
   */
  setLevel(levelStr) {
    const newLevel = LEVELS[levelStr];
    if (newLevel !== undefined) {
      this._level = newLevel;
      // On loggue uniquement si on est en mode DEBUG pour confirmer le changement
      if (this._level >= LEVELS.DEBUG) {
        console.debug(`${this.prefix} Niveau de log mis à jour : ${levelStr}`);
      }
    }
  }

  debug(msg, ...args) {
    if (this._level < LEVELS.DEBUG) return;
    console.debug(`${this.prefix} 🐛`, msg, ...args);
  }

  info(msg, ...args) {
    if (this._level < LEVELS.INFO) return;
    console.log(`${this.prefix} ℹ️`, msg, ...args);
  }

  warn(msg, ...args) {
    if (this._level < LEVELS.WARN) return;
    console.warn(`${this.prefix} ⚠️`, msg, ...args);
  }

  error(msg, ...args) {
    if (this._level < LEVELS.ERROR) return;
    console.error(`${this.prefix} ❌`, msg, ...args);
  }
}

export const logger = new Logger();