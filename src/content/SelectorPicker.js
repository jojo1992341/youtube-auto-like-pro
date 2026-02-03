import { logger } from '../infrastructure/logger.js';
import { SelectorGenerator } from './SelectorGenerator.js';

/**
 * SELECTOR PICKER (REFACTORISÉ v3)
 * Responsabilité : Gérer l'interaction utilisateur (Clic, Survol, Évaporation).
 * Délègue la complexité heuristique à SelectorGenerator.
 * * Mise à jour v5.4 : Support des sélecteurs de commentaires (5 étapes).
 * * Fix v5.4.3 : Suppression des IDs hardcodés (#placeholder-area).
 */
export class SelectorPicker {
  constructor(overlayManager, storageService) {
    if (!overlayManager) throw new Error('OverlayManager requis');
    if (!storageService) throw new Error('StorageService requis');

    this.overlay = overlayManager;
    this.storage = storageService;
    this.generator = new SelectorGenerator(); // Composition forte

    this.isActive = false;
    this._isSimulatingClick = false; // Flag pour ignorer nos propres clics simulés
    this.currentStep = null; // 'LIKE' | 'DISLIKE' | 'CHANNEL' | 'PLACEHOLDER' | 'SUBMIT'

    this.results = {
      likeButton: null,
      dislikeButton: null,
      channelName: null,
      commentPlaceholder: null,
      commentSubmitButton: null
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
    this._isSimulatingClick = false;
    this.currentStep = 'LIKE';
    this.results = { 
      likeButton: null, 
      dislikeButton: null, 
      channelName: null,
      commentPlaceholder: null,
      commentSubmitButton: null
    };

    // Activation UI
    this.overlay.enableSelectionMode();
    this.overlay.updateSelectionInstruction('ÉTAPE 1/5 : Cliquez sur le bouton J\'AIME 👍');

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
    if (!this.isActive || this._isSimulatingClick) return;

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
    // Si on est en train de simuler un clic pour ouvrir l'UI, on laisse passer
    if (this._isSimulatingClick) {
      return; 
    }

    if (!this.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    const rawTarget = e.target;
    // CRITIQUE : On remonte au bouton réel pour éviter de capturer une icône SVG
    const target = this._getInteractiveTarget(rawTarget);

    // DÉLÉGATION : C'est le générateur qui travaille maintenant
    const selector = this.generator.generate(target);
    logger.info(`[SelectorPicker] Sélecteur généré : ${selector}`);

    // Machine à états
    switch (this.currentStep) {
      case 'LIKE':
        this._handleStepLike(selector);
        break;
      case 'DISLIKE':
        this._handleStepDislike(selector);
        break;
      case 'CHANNEL':
        this._handleStepChannel(selector);
        break;
      case 'PLACEHOLDER':
        this._handleStepPlaceholder(selector, target);
        break;
      case 'SUBMIT':
        await this._handleStepSubmit(selector);
        break;
    }
  }

  _handleStepLike(selector) {
    this.results.likeButton = selector;
    this.currentStep = 'DISLIKE';
    this.overlay.updateSelectionInstruction('ÉTAPE 2/5 : Cliquez sur le bouton JE N\'AIME PAS 👎');
    this.overlay.showToast('Bouton Like capturé !', 'info', 1000);
  }

  _handleStepDislike(selector) {
    this.results.dislikeButton = selector;
    this.currentStep = 'CHANNEL';
    this.overlay.updateSelectionInstruction('ÉTAPE 3/5 : Cliquez sur le NOM DE LA CHAÎNE 📺');
    this.overlay.showToast('Bouton Dislike capturé !', 'info', 1000);
  }

  _handleStepChannel(selector) {
    this.results.channelName = selector;
    this.currentStep = 'PLACEHOLDER';
    
    // Instruction spécifique : scroller vers le bas
    this.overlay.updateSelectionInstruction('ÉTAPE 4/5 : Descendez et cliquez sur "Ajouter un commentaire..." 💬');
    this.overlay.showToast('Nom chaîne capturé !', 'info', 1000);
    
    // Aide visuelle : tentative de scroll vers les commentaires
    const comments = document.querySelector('ytd-comments');
    if (comments) comments.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  _handleStepPlaceholder(selector, targetElement) {
    this.results.commentPlaceholder = selector;
    this.currentStep = 'SUBMIT';
    
    this.overlay.updateSelectionInstruction('ÉTAPE 5/5 : Cliquez maintenant sur le bouton "Ajouter un commentaire" 🚀');
    this.overlay.showToast('Zone ouverte ! Activation du bouton...', 'info', 1500);

    // ASTUCE UX : Ouverture + Activation forcée
    try {
      this._isSimulatingClick = true; 

      // 1. Clic d'ouverture : On clique sur ce que l'user a choisi
      // On fait confiance au bubbling naturel si l'user a cliqué sur un enfant
      setTimeout(() => {
        targetElement.click();

        // 2. Attente de l'animation et injection de texte pour activer le bouton
        setTimeout(() => {
          this._forceActivateSubmitButton();
          
          // 3. Retour à la normale
          this._isSimulatingClick = false;
        }, 600); // 600ms pour être sûr que l'input est là
      }, 50);

    } catch (e) {
      logger.warn('Impossible d\'ouvrir la zone de commentaire automatiquement', e);
      this._isSimulatingClick = false;
    }
  }

  /**
   * Cherche le champ input qui vient d'apparaître et injecte du texte
   * pour que YouTube active le bouton Submit.
   */
  _forceActivateSubmitButton() {
    // Sélecteurs standards de l'input riche YouTube
    const inputCandidates = document.querySelectorAll('#contenteditable-root, div[contenteditable="true"]');
    
    let filled = false;
    inputCandidates.forEach(input => {
      // On ne vise que celui qui est visible (celui qu'on vient d'ouvrir)
      if (input.offsetParent !== null && !filled) {
        input.textContent = 'Calibration...';
        // Event input nécessaire pour Polymer
        input.dispatchEvent(new Event('input', { bubbles: true }));
        filled = true;
      }
    });
    
    if (filled) {
      logger.info('[SelectorPicker] Bouton Submit activé artificiellement.');
    }
  }

  async _handleStepSubmit(selector) {
    this.results.commentSubmitButton = selector;
    
    // FIN DU PROCESSUS
    try {
      await this.storage.saveCustomSelectors(this.results);
      this.overlay.showToast('Configuration complète sauvegardée ! 🎉', 'success');
      
      // Nettoyage sympa : on vide le champ de calibration qu'on a rempli
      this._cleanupCalibrationText();
    } catch (e) {
      logger.error('Erreur sauvegarde sélecteurs', e);
      this.overlay.showToast('Erreur lors de la sauvegarde', 'error');
    }
    this.stop();
  }

  _cleanupCalibrationText() {
    try {
        const inputs = document.querySelectorAll('#contenteditable-root');
        inputs.forEach(input => {
            if (input.textContent === 'Calibration...') {
                input.textContent = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    } catch (e) { /* ignore */ }
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
    // Suppression de #placeholder-area (on garde ce qui est générique)
    return element.closest('button, a, [role="button"], [role="link"]') || element;
  }
}