import { STORAGE_KEYS, DEFAULTS, MESSAGES } from '../core/Constants.js';
import { StorageService } from '../services/StorageService.js';
import { OpenRouterService } from '../services/OpenRouterService.js';

/**
 * BACKGROUND CONTROLLER
 * Point d'entrée du Service Worker.
 * Orchestre les événements d'installation et la communication asynchrone pour l'IA.
 */
class BackgroundController {
  constructor() {
    this.storage = new StorageService();
    this.aiService = new OpenRouterService();
    
    // Initialisation immédiate
    this.storage.init().catch(console.error);
    
    this._bindEvents();
  }

  _bindEvents() {
    chrome.runtime.onInstalled.addListener((details) => this._handleInstall(details));
    
    // Écouteur de messages unifié
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === MESSAGES.AI_GENERATE_REQUEST) {
        this._handleAIRequest(message.payload, sendResponse);
        return true; // Indique à Chrome qu'on répondra de manière asynchrone
      }
      return false;
    });
  }

  /**
   * Gère l'installation et l'initialisation Zero-Config.
   */
  async _handleInstall({ reason, previousVersion }) {
    console.log(`[AutoLike Pro] Event: ${reason} (Prev: ${previousVersion})`);

    try {
      if (reason === 'install') {
        await this._setupDefaults();
      }
    } catch (error) {
      console.error('[AutoLike Pro] Erreur critique background:', error);
    }
  }

  /**
   * Traite la demande de génération de commentaire.
   * Récupère la config sécurisée et délègue au service OpenRouter.
   */
  async _handleAIRequest(payload, sendResponse) {
    try {
      // 1. Récupération de la config fraîche
      const aiConfig = await this.storage.getAIConfig();

      // 2. Vérifications de sécurité
      if (!aiConfig.isEnabled) {
        throw new Error('Le module IA est désactivé dans les réglages.');
      }
      if (!aiConfig.apiKey) {
        throw new Error('Clé API manquante. Veuillez configurer OpenRouter.');
      }

      // 3. Appel au Service
      const comment = await this.aiService.generateComment({
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        systemPrompt: aiConfig.systemPrompt,
        videoTitle: payload.videoTitle,
        channelName: payload.channelName
      });

      // 4. Réponse succès
      sendResponse({ 
        status: 'success', 
        type: MESSAGES.AI_GENERATE_SUCCESS, 
        data: comment 
      });

    } catch (error) {
      // 5. Gestion d'erreur propre pour le frontend
      console.error('[AutoLike Pro] AI Error:', error);
      sendResponse({ 
        status: 'error', 
        type: MESSAGES.AI_GENERATE_ERROR, 
        error: error.message 
      });
    }
  }

  async _setupDefaults() {
    const existing = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);

    if (!existing[STORAGE_KEYS.CONFIG]) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.CONFIG]: { ...DEFAULTS.CONFIG, customSelectors: {} },
        [STORAGE_KEYS.STATS]: DEFAULTS.STATS,
        [STORAGE_KEYS.HISTORY]: [],
        [STORAGE_KEYS.AI_CONFIG]: DEFAULTS.AI_CONFIG // Ajout explicite
      });
      console.log('[AutoLike Pro] Configuration initialisée (Mode Zero-Config).');

      chrome.tabs.create({
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        active: true
      });
    }
  }
}

// Initialisation unique
new BackgroundController();