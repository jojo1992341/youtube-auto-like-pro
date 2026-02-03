import { logger } from '../infrastructure/logger.js';
import { SelectorGenerator } from './SelectorGenerator.js';

/**
 * SELECTOR PICKER (REFACTORISÉ v2)
 * Responsabilité : Gérer l'interaction utilisateur (Clic, Survol, Évaporation).
 * Délègue la complexité heuristique à SelectorGenerator.
 */
export class SelectorPicker {
  constructor(overlayManager, storageService) {
    if (!overlayManager) throw new Error('OverlayManager requis');
    if (!storageService) throw new Error('StorageService requis');

    this.overlay = overlayManager;
    this.storage = storageService;
    this.generator = new SelectorGenerator(); // Composition forte

    this.isActive = false;
    this.currentStep = null; // 'LIKE' | 'DISLIKE' | 'CHANNEL' | 'COMMENT_PLACEHOLDER' | 'COMMENT_INPUT' | 'COMMENT_SUBMIT'

    this.results = {
      likeButton: null,
      dislikeButton: null,
      channelName: null,
      commentPlaceholder: null,
      commentInput: null,
      commentSubmit: null
    };

    // Bindings
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleClick = this._handleClick.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Lance le processus de sélection interactif.
   */
  start() {
    if (this.isActive) return;

    this.isActive = true;
    this.currentStep = 'LIKE';
    this.results = {
      likeButton: null,
      dislikeButton: null,
      channelName: null,
      commentPlaceholder: null,
      commentInput: null,
      commentSubmit: null
    };

    // Activation UI
    this.overlay.enableSelectionMode();
    this.overlay.updateSelectionInstruction('ÉTAPE 1/6 : Cliquez sur le bouton J\'AIME 👍');

    // Ajout des écouteurs en mode CAPTURE (true)
    document.addEventListener('mousemove', this._handleMouseMove, true);
    document.addEventListener('click', this._handleClick, true);
    document.addEventListener('keydown', this._handleKeyDown, true);

    logger.info('[SelectorPicker] Mode sélection démarré.');
  }

  /**
   * Arrête le processus et nettoie tout.
   */
  stop() {
    if (!this.isActive) return;

    this.isActive = false;
    this.currentStep = null;

    document.removeEventListener('mousemove', this._handleMouseMove, true);
    document.removeEventListener('click', this._handleClick, true);
    document.removeEventListener('keydown', this._handleKeyDown, true);

    this.overlay.disableSelectionMode();
    logger.info('[SelectorPicker] Mode sélection arrêté.');
  }

  /**
   * Gère le survol : vise l'élément interactif parent si possible.
   */
  _handleMouseMove(e) {
    if (!this.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    // On cherche l'élément interactif le plus proche sous la souris
    const rawTarget = e.target;
    const interactiveTarget = this._getInteractiveTarget(rawTarget);

    // On met en surbrillance l'élément qui sera réellement capturé
    const rect = interactiveTarget.getBoundingClientRect();
    this.overlay.drawHighlight(rect);
  }

  /**
   * Gère le clic de sélection.
   */
  async _handleClick(e) {
    if (!this.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    const rawTarget = e.target;
    // CRITIQUE : On remonte au bouton réel pour éviter de capturer une icône SVG
    const target = this._getInteractiveTarget(rawTarget);

    // DÉLÉGATION : C'est le générateur qui travaille maintenant
    const selector = this.generator.generate(target);
    logger.info(`[SelectorPicker] Sélecteur généré : ${selector}`);

    if (this.currentStep === 'LIKE') {
      this._handleStepLike(selector);
    } else if (this.currentStep === 'DISLIKE') {
      this._handleStepDislike(selector);
    } else if (this.currentStep === 'CHANNEL') {
      await this._handleStepChannel(selector);
    } else if (this.currentStep === 'COMMENT_PLACEHOLDER') {
      this._handleStepCommentPlaceholder(selector);
    } else if (this.currentStep === 'COMMENT_INPUT') {
      this._handleStepCommentInput(selector);
    } else if (this.currentStep === 'COMMENT_SUBMIT') {
      await this._handleStepCommentSubmit(selector);
    }
  }

  _handleStepLike(selector) {
    this.results.likeButton = selector;
    this.currentStep = 'DISLIKE';
    this.overlay.updateSelectionInstruction('ÉTAPE 2/6 : Cliquez sur le bouton JE N\'AIME PAS 👎');
    this.overlay.showToast('Bouton Like capturé !', 'info', 1000);
  }

  _handleStepDislike(selector) {
    this.results.dislikeButton = selector;
    this.currentStep = 'CHANNEL';
    this.overlay.updateSelectionInstruction('ÉTAPE 3/6 : Cliquez sur le NOM DE LA CHAÎNE 📺');
    this.overlay.showToast('Bouton Dislike capturé !', 'info', 1000);
  }

  async _handleStepChannel(selector) {
    this.results.channelName = selector;
    this.currentStep = 'COMMENT_PLACEHOLDER';
    this.overlay.updateSelectionInstruction('ÉTAPE 4/6 : Cliquez sur "Ajouter un commentaire" 💬');
    this.overlay.showToast('Nom de chaîne capturé !', 'info', 1000);
  }

  _handleStepCommentPlaceholder(selector) {
    this.results.commentPlaceholder = selector;
    this.currentStep = 'COMMENT_INPUT';
    this.overlay.updateSelectionInstruction('ÉTAPE 5/6 : Cliquez dans la zone de saisie du commentaire ✍️');
    this.overlay.showToast('Placeholder commentaire capturé !', 'info', 1000);
  }

  _handleStepCommentInput(selector) {
    this.results.commentInput = selector;
    this.currentStep = 'COMMENT_SUBMIT';
    this.overlay.updateSelectionInstruction('ÉTAPE 6/6 : Cliquez sur le bouton "Poster" 🚀');
    this.overlay.showToast('Zone de saisie capturée !', 'info', 1000);
  }

  async _handleStepCommentSubmit(selector) {
    this.results.commentSubmit = selector;
    try {
      await this.storage.saveCustomSelectors(this.results);
      this.overlay.showToast('Configuration sauvegardée ! Rafraîchissez la page.', 'success');
    } catch (e) {
      logger.error('Erreur sauvegarde sélecteurs', e);
      this.overlay.showToast('Erreur lors de la sauvegarde', 'error');
    }
    this.stop();
  }

  _handleKeyDown(e) {
    if (!this.isActive) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.stop();
      this.overlay.showToast('Sélection annulée', 'warning');
    }
  }

  /**
   * Remonte l'arbre DOM pour trouver le vrai élément interactif.
   * Transforme un clic sur <path> ou <svg> en clic sur <button> ou <a>.
   */
  _getInteractiveTarget(element) {
    // Liste des éléments considérés comme interactifs
    return element.closest('button, a, [role="button"], [role="link"]') || element;
  }
}
