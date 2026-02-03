import { StorageService } from '../services/StorageService.js';
import { YouTubeDOMAdapter } from '../infrastructure/YouTubeDOMAdapter.js';
import { OverlayManager } from '../ui/OverlayManager.js';
import { SelectorPicker } from './SelectorPicker.js';
import { DecisionEngine, DECISION } from '../core/DecisionEngine.js';
import { MESSAGES } from '../core/Constants.js';
import { logger } from '../infrastructure/logger.js';

/**
 * Utilitaire pour attendre (Promisified setTimeout)
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * EXÉCUTEUR D'INTERACTIONS
 * Responsabilité : Exécuter les actions concrètes sur le DOM.
 * * Mise à jour v5.3 : Intégration du flux de commentaire IA.
 */
class InteractionExecutor {
  constructor(adapter, overlay, storage) {
    this.adapter = adapter;
    this.overlay = overlay;
    this.storage = storage;
  }

  async execute(decision, context) {
    const { videoId, channelName, waitTime, config } = context;

    switch (decision) {
      case DECISION.LIKE:
        await delay(waitTime);
        if (context.checkCancel()) return;
        
        // 1. Action Like
        const liked = await this._attemptLike(videoId, channelName, config);
        
        // 2. Flux Commentaire IA (Si Like réussi)
        if (liked) {
          await this._handleAICommentFlow(channelName, document.title, context.checkCancel);
        }
        break;

      case DECISION.SKIP:
        await this.storage.incrementStat('skipped');
        logger.info('Vidéo ignorée (Blacklist).');
        break;

      case DECISION.ASK_CONSENT:
        await this._handleUserConsent(context);
        break;

      case DECISION.DO_NOTHING:
      default:
        break;
    }
  }

  async _handleUserConsent(context) {
    const { channelName, videoId, checkCancel } = context;
    const { shouldLike, remember } = await this.overlay.askConsent(channelName);

    if (checkCancel()) return;

    if (shouldLike) {
      if (remember) {
        await this._updateList('whitelist', channelName);
        this.overlay.showToast('Ajouté aux favoris ⭐', 'success');
      }
      await delay(500);
      if (checkCancel()) return;
      
      const liked = await this._attemptLike(videoId, channelName, context.config);
      
      // Flux IA après consentement manuel
      if (liked) {
        await this._handleAICommentFlow(channelName, document.title, checkCancel);
      }
    } else {
      if (remember) {
        await this._updateList('blacklist', channelName);
        this.overlay.showToast('Chaîne bloquée et Dislikée 👎', 'warning');
      }
      await delay(500);
      if (checkCancel()) return;
      await this._attemptDislike(context.config);
    }
  }

  /**
   * FLUX IA PRINCIPAL
   * Orchestre la génération, la validation et le post.
   */
  async _handleAICommentFlow(channelName, rawTitle, checkCancel) {
    // 1. Vérification Config
    const aiConfig = await this.storage.getAIConfig();
    if (!aiConfig.isEnabled) return;

    // Petite pause pour laisser l'UI respirer après le toast de Like
    await delay(1000);
    if (checkCancel()) return;

    this.overlay.showToast('🤖 L\'IA prépare 5 variantes...', 'info', 2000);

    try {
      // 2. Génération (via Background)
      const videoTitle = rawTitle.replace(' - YouTube', '');
      const response = await chrome.runtime.sendMessage({
        type: MESSAGES.AI_GENERATE_REQUEST,
        payload: { videoTitle, channelName }
      });

      if (checkCancel()) return;

      if (!response || response.type === MESSAGES.AI_GENERATE_ERROR) {
        throw new Error(response?.error || 'Erreur inconnue');
      }

      // NOUVEAU : On reçoit un tableau de suggestions
      const suggestions = response.data;

      // 3. Validation Humaine (Obligatoire avec sélection)
      const { confirmed, finalComment } = await this.overlay.askCommentValidation(channelName, suggestions);

      if (!confirmed || !finalComment) {
        this.overlay.showToast('Commentaire annulé', 'info');
        return;
      }

      if (checkCancel()) return;

      // 4. Injection & Post
      this.overlay.showToast('Préparation de la zone de commentaire...', 'info');
      
      const inputField = await this.adapter.prepareCommentInput(
        context.config.customSelectors?.commentPlaceholder,
        context.config.customSelectors?.commentInput
      );
      this.adapter.fillCommentInput(inputField, finalComment);
      
      await delay(600); // Temps pour que l'UI YouTube réagisse à l'input
      
      const submitBtn = await this.adapter.getSubmitCommentButton(
        context.config.customSelectors?.commentSubmit
      );
      
      if (submitBtn) {
        submitBtn.click();
        this.overlay.showToast('Commentaire posté avec succès ! 🎉', 'success');
        logger.info('✅ Commentaire IA posté.');
      } else {
        throw new Error('Bouton "Poster" introuvable ou inactif.');
      }

    } catch (error) {
      logger.error('Flux IA échoué', error);
      this.overlay.showToast(`Erreur IA: ${error.message}`, 'error');
    }
  }

  async _attemptLike(videoId, channelName, config) {
    const btn = this.adapter.getLikeButton(config.customSelectors?.likeButton);

    if (!btn) {
      logger.warn('Bouton Like introuvable.');
      return false;
    }

    if (this.adapter.isLiked(btn)) {
      logger.info('Vidéo déjà likée.');
      return true; // Considéré comme succès pour enchaîner l'IA
    }

    try {
      btn.click();
      await Promise.all([
        this.storage.incrementStat('auto'),
        this.storage.addToHistory({
          videoId,
          channelName,
          videoTitle: document.title.replace(' - YouTube', ''),
          timestamp: Date.now(),
          action: 'AUTO_LIKE'
        })
      ]);
      this.overlay.showToast('J\'aime ajouté 👍', 'success');
      logger.info('✅ Like effectué.');
      return true;
    } catch (error) {
      logger.error('Erreur lors du clic', error);
      this.overlay.showToast('Erreur technique', 'error');
      return false;
    }
  }

  async _attemptDislike(config) {
    const btn = this.adapter.getDislikeButton(config.customSelectors?.dislikeButton);
    if (!btn) return;

    if (this.adapter.isDisliked(btn)) return;

    try {
      btn.click();
      await this.storage.incrementStat('skipped');
      logger.info('✅ Dislike effectué.');
    } catch (error) {
      logger.error('Erreur lors du clic Dislike', error);
    }
  }

  async _updateList(listType, name) {
    const config = await this.storage.getConfig();
    const list = config[listType] || [];
    if (!list.includes(name)) {
      await this.storage.updateConfig({
        [listType]: [...list, name]
      });
    }
  }
}

/**
 * ORCHESTRATEUR DE CONTENU
 * Responsabilité : Coordonner le cycle de vie.
 */
class ContentOrchestrator {
  constructor({ adapter, overlay, picker, storage }) {
    this.adapter = adapter;
    this.overlay = overlay;
    this.picker = picker;
    this.storage = storage;

    this.executor = new InteractionExecutor(adapter, overlay, storage);

    this.currentContext = {
      videoId: null,
      isProcessing: false
    };

    this.handleVideoDetected = this.handleVideoDetected.bind(this);
  }

  async init() {
    logger.info('🚀 Démarrage de AutoLike Pro (v5.3 AI)...');
    try {
      await this.storage.init();
      this.adapter.start(this.handleVideoDetected);
      this._initMessageListeners();
      logger.info('✅ Orchestrateur prêt.');
    } catch (e) {
      logger.error('❌ Échec critique au démarrage', e);
      this.overlay.showToast('Erreur d\'initialisation', 'error');
    }
  }

  async handleVideoDetected({ videoId }) {
    logger.info(`🎬 Nouvelle vidéo détectée : ${videoId}`);
    this.currentContext = { videoId, isProcessing: true };

    try {
      const config = await this.storage.getConfig();
      if (!config.isEnabled) {
        logger.debug('Extension désactivée via config.');
        return;
      }

      if (!this._hasRequiredSelectors(config)) {
        await this._startOnboarding();
        return;
      }

      await this._processVideoInteraction(videoId, config);

    } catch (e) {
      logger.error('Erreur durant le traitement vidéo', e);
    } finally {
      if (this.currentContext.videoId === videoId) {
        this.currentContext.isProcessing = false;
      }
    }
  }

  _hasRequiredSelectors(config) {
    // Note: On ne vérifie pas les sélecteurs de commentaires ici car ils sont gérés dynamiquement dans l'adapter
    return config.customSelectors?.likeButton &&
      config.customSelectors?.dislikeButton &&
      config.customSelectors?.channelName;
  }

  async _startOnboarding() {
    logger.info('🆕 [Onboarding] Config incomplète.');
    await delay(1500);
    this.overlay.showToast('🎯 Config requise : cliquez sur J\'AIME, JE N\'AIME PAS, la chaîne et les zones de commentaire', 'info', 6000);
    this.picker.start();
  }

  async _processVideoInteraction(videoId, config) {
    const channelName = await this.adapter.getChannelName(config.customSelectors?.channelName);

    if (this._hasContextChanged(videoId)) return;

    if (!channelName) {
      logger.warn('Nom de chaîne introuvable.');
      return;
    }

    const engine = new DecisionEngine(config);
    const decision = engine.decide(channelName);
    const waitTime = engine.computeDelayMs();

    logger.info(`🧠 Décision: ${decision} (attente: ${waitTime}ms)`);

    await this.executor.execute(decision, {
      videoId,
      channelName,
      waitTime,
      config,
      checkCancel: () => this._hasContextChanged(videoId)
    });
  }

  _hasContextChanged(videoId) {
    return this.currentContext.videoId !== videoId;
  }

  _initMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === MESSAGES.START_SELECTION_MODE) {
        this.picker.start();
        sendResponse({ status: 'started' });
      }
      if (message.type === MESSAGES.START_DIAGNOSTIC) {
        this._runDiagnostic();
        sendResponse({ status: 'running' });
      }
      return false;
    });
  }

  async _runDiagnostic() {
    const config = await this.storage.getConfig();
    const likeBtn = this.adapter.getLikeButton(config.customSelectors?.likeButton);
    const dislikeBtn = this.adapter.getDislikeButton(config.customSelectors?.dislikeButton);
    const channelEl = await this.adapter.getChannelElement(config.customSelectors?.channelName);

    const missing = [];
    if (!likeBtn) missing.push('J\'aime');
    if (!dislikeBtn) missing.push('Je n\'aime pas');
    if (!channelEl) missing.push('Chaîne');

    if (missing.length === 0) {
      this.overlay.showToast('✅ Configuration valide !', 'success');
      await this.overlay.playDiagnosticAnimation([
        { element: likeBtn },
        { element: dislikeBtn },
        { element: channelEl }
      ]);
    } else {
      this.overlay.showToast(`⚠️ Manquant : ${missing.join(', ')}`, 'warning', 4000);
      await delay(1500);
      this.picker.start();
    }
  }
}

// Composition Root
function bootstrap() {
  const storage = new StorageService();
  const adapter = new YouTubeDOMAdapter();
  const overlay = new OverlayManager();
  const picker = new SelectorPicker(overlay, storage);

  const orchestrator = new ContentOrchestrator({
    adapter,
    overlay,
    picker,
    storage
  });

  orchestrator.init();

  if (typeof window !== 'undefined') {
    window.__autolikePro = orchestrator;
    window.__autolikeStorage = storage;
  }
}

bootstrap();
