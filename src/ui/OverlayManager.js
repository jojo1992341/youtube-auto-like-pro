import { ShadowHost } from './components/ShadowHost.js';
import { ToastSystem } from './components/ToastSystem.js';
import { ModalSystem } from './components/ModalSystem.js';
import { SelectionSystem } from './components/SelectionSystem.js';

/**
 * MANAGER PRINCIPAL (Facade)
 * Point d'entrée unique pour l'application.
 * * Refactoring v5.2 :
 * Utilise désormais la composition de modules UI distincts.
 */
export class OverlayManager {
  constructor() {
    this.host = new ShadowHost();

    // Instanciation lazy des sous-systèmes
    this.toasts = new ToastSystem(this.host.shadowRoot);
    this.modals = new ModalSystem(this.host.shadowRoot);
    this.selection = new SelectionSystem(this.host.shadowRoot);
  }

  // --- Facade API ---

  showToast(message, type = 'info', duration = 4000) {
    this.toasts.show(message, type, duration);
  }

  /**
   * Demande le consentement pour l'action Like/Dislike
   */
  askConsent(channelName) {
    return this.modals.askConsent(channelName);
  }

  /**
   * NOUVEAU : Demande la validation d'un commentaire généré par IA
   * @param {string} channelName 
   * @param {string} generatedComment 
   * @returns {Promise<{confirmed: boolean, finalComment: string}>}
   */
  askCommentValidation(channelName, generatedComment) {
    return this.modals.askCommentValidation(channelName, generatedComment);
  }

  enableSelectionMode() {
    this.selection.enable();
  }

  disableSelectionMode() {
    this.selection.disable();
  }

  updateSelectionInstruction(text) {
    this.selection.updateInstruction(text);
  }

  drawHighlight(rect) {
    this.selection.highlight(rect);
  }

  async playDiagnosticAnimation(targets) {
    const STEP_DURATION = 800; // ms

    for (const target of targets) {
      if (target && target.element) {
        this.drawHighlight(target.element.getBoundingClientRect());
      }
      await new Promise(r => setTimeout(r, STEP_DURATION));
    }

    this.drawHighlight(null);
  }

  clearAllToasts() {
    this.toasts.clearAll();
  }
}