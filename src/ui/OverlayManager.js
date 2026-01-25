import { ShadowHost } from './components/ShadowHost.js';
import { ToastSystem } from './components/ToastSystem.js';
import { ModalSystem } from './components/ModalSystem.js';
import { SelectionSystem } from './components/SelectionSystem.js';

/**
 * MANAGER PRINCIPAL (Facade)
 * Point d'entrée unique pour l'application.
 * 
 * Refactoring v5.2 :
 * Utilise désormais la composition de modules UI distincts pour le ShadowDOM,
 * les Toasts, les Modales et la Sélection.
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

  askConsent(channelName) {
    return this.modals.askConsent(channelName);
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

  /**
   * Joue la séquence d'animation pour le diagnostic.
   * @param {Array<{element: HTMLElement}>} targets - Liste ordonnée des cibles (Like, Dislike, Channel)
   */
  async playDiagnosticAnimation(targets) {
    const STEP_DURATION = 800; // ms

    for (const target of targets) {
      if (target && target.element) {
        this.drawHighlight(target.element.getBoundingClientRect());
      }
      // Pause bloquante pour l'effet visuel
      await new Promise(r => setTimeout(r, STEP_DURATION));
    }

    // Nettoyage final
    this.drawHighlight(null);
  }

  clearAllToasts() {
    this.toasts.clearAll();
  }
}