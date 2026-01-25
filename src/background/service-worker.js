import { STORAGE_KEYS, DEFAULTS } from '../core/Constants.js';

/**
 * BACKGROUND CONTROLLER
 * Point d'entrée du Service Worker.
 */
class BackgroundController {
  constructor() {
    this._bindEvents();
  }

  _bindEvents() {
    chrome.runtime.onInstalled.addListener((details) => this._handleInstall(details));
  }

  async _handleInstall({ reason, previousVersion }) {
    console.log(`[AutoLike Pro] Event: ${reason} (Prev: ${previousVersion})`);

    try {
      if (reason === 'install') {
        await this._setupDefaults();
      }
      // Plus de migration V4 ici.
    } catch (error) {
      console.error('[AutoLike Pro] Erreur critique background:', error);
    }
  }

  async _setupDefaults() {
    // Vérifie si la config existe déjà pour ne pas écraser
    const existing = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);

    if (!existing[STORAGE_KEYS.CONFIG]) {
      // 1. Initialisation Storage vide (Zero-Config)
      await chrome.storage.local.set({
        [STORAGE_KEYS.CONFIG]: { ...DEFAULTS.CONFIG, customSelectors: {} },
        [STORAGE_KEYS.STATS]: DEFAULTS.STATS,
        [STORAGE_KEYS.HISTORY]: []
      });
      console.log('[AutoLike Pro] Configuration initialisée (Mode Zero-Config).');

      // 2. Ouvrir la vidéo de tutoriel pour l'onboarding
      chrome.tabs.create({
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        active: true
      });
    }
  }
}

// Initialisation unique
new BackgroundController();