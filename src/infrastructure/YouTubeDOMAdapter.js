import { logger } from './logger.js';
import { DEFAULT_DOM_CONFIG } from './DOMConfig.js';
import { NavigationObserver } from './NavigationObserver.js';

/**
 * Gestionnaire de Cache DOM simple (TTL + Validation).
 */
class ElementCache {
  constructor(ttlMs, validator) {
    this.ttl = ttlMs;
    this.validator = validator;
    this._store = { key: null, element: null, timestamp: 0 };
  }

  get(key) {
    if (this._store.key !== key) return null;
    if (!this._isValid()) {
      this.clear();
      return null;
    }
    return this._store.element;
  }

  set(key, element) {
    this._store = {
      key,
      element,
      timestamp: Date.now()
    };
  }

  clear() {
    this._store = { key: null, element: null, timestamp: 0 };
  }

  _isValid() {
    const { element, timestamp } = this._store;
    if (!element || !element.isConnected) return false;

    const age = Date.now() - timestamp;
    if (age > this.ttl) return false;

    return this.validator ? this.validator(element) : true;
  }
}

/**
 * ADAPTATEUR DOM YOUTUBE
 * Responsabilité unique : Fournir une interface normalisée pour accéder aux éléments du DOM YouTube.
 * * Mise à jour v5.3 : Support de l'injection de commentaires.
 */
export class YouTubeDOMAdapter {
  constructor(config = DEFAULT_DOM_CONFIG) {
    this.config = config;
    this.observer = new NavigationObserver(config);

    // Initialisation du cache avec validateur de visibilité
    this.cache = new ElementCache(
      config.TIMEOUTS.CACHE_TTL,
      (el) => this._isVisible(el)
    );
  }

  /**
   * Initialise l'adaptateur et la surveillance.
   */
  start(onVideoChanged) {
    const wrappedCallback = (data) => {
      this.cache.clear();
      onVideoChanged(data);
    };
    this.observer.start(wrappedCallback);
  }

  stop() {
    this.observer.stop();
    this.cache.clear();
  }

  async getChannelName(customSelector = null) {
    const element = await this.getChannelElement(customSelector);
    return this._extractChannelName(element);
  }

  async getChannelElement(customSelector = null) {
    const selectors = this._mergeSelectors(customSelector, this.config.SELECTORS.CHANNEL_NAME);

    try {
      const element = await this._waitForElement(selectors, this.config.TIMEOUTS.ELEMENT_SEARCH);
      if (this._isChannelNameValid(this._extractChannelName(element))) {
        return element;
      }

      return await this._getFallbackChannelElement();
    } catch (e) {
      return await this._getFallbackChannelElement();
    }
  }

  getLikeButton(customSelector = null) {
    return this._getCachedOrFind('like-button', customSelector, this.config.SELECTORS.LIKE_BUTTONS);
  }

  getDislikeButton(customSelector = null) {
    return this._getCachedOrFind('dislike-button', customSelector, this.config.SELECTORS.DISLIKE_BUTTONS);
  }

  isLiked(btn) {
    return this._isButtonPressed(btn);
  }

  isDisliked(btn) {
    return this._isButtonPressed(btn);
  }

  // --- NOUVEAU : Méthodes de Gestion des Commentaires (Configurables) ---

  /**
   * Tente de préparer la zone de commentaire.
   * Scrolle, clique sur le placeholder, et attend l'input.
   * @param {Object} customSelectors - Sélecteurs optionnels { placeholder, input }
   */
  async prepareCommentInput(customSelectors = {}) {
    // 1. Trouver le conteneur global des commentaires pour scroller
    const commentsSection = document.querySelector('ytd-comments');
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 2. Trouver et cliquer sur le placeholder "Ajouter un commentaire..."
    const placeholderSelectors = this._mergeSelectors(
        customSelectors.placeholder, 
        this.config.SELECTORS.COMMENT_PLACEHOLDER
    );
    const placeholder = await this._waitForElement(placeholderSelectors, 2000).catch(() => null);
    
    if (placeholder && this._isVisible(placeholder)) {
      placeholder.click();
    }

    // 3. Attendre que l'éditeur réel apparaisse
    const inputSelectors = this._mergeSelectors(
        customSelectors.input, 
        this.config.SELECTORS.COMMENT_INPUT
    );
    const inputField = await this._waitForElement(inputSelectors, 2000).catch(() => null);
    
    if (!inputField) {
      throw new Error('Impossible d\'activer la zone de commentaire.');
    }

    return inputField;
  }

  /**
   * Injecte le texte dans le champ de commentaire et simule la frappe.
   * @param {HTMLElement} inputField 
   * @param {string} text 
   */
  fillCommentInput(inputField, text) {
    if (!inputField) return;

    // Reset du contenu
    inputField.innerText = text;
    
    // Crucial : Dispatcher l'événement 'input' pour que YouTube (Polymer) détecte le changement
    // Sans ça, le bouton "Poster" reste grisé.
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    inputField.dispatchEvent(inputEvent);
  }

  /**
   * Trouve et retourne le bouton de soumission (Poster).
   * @param {string} customSelector - Sélecteur optionnel
   */
  async getSubmitCommentButton(customSelector = null) {
    const selectors = this._mergeSelectors(
        customSelector, 
        this.config.SELECTORS.COMMENT_SUBMIT
    );
    
    const btn = await this._waitForElement(selectors, 1000).catch(() => null);
    
    // Vérification supplémentaire : le bouton ne doit pas être désactivé
    if (btn && btn.hasAttribute('disabled')) {
      logger.warn('[DOM] Bouton Poster trouvé mais désactivé (input event raté ?).');
    }
    
    return btn;
  }

  // --- Helpers Privés ---

  _getCachedOrFind(cacheKey, customSelector, defaultSelectors) {
    // 1. Essai Cache
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // 2. Recherche DOM
    const selectors = this._mergeSelectors(customSelector, defaultSelectors);
    const element = this._findFirstVisibleElement(selectors);

    // 3. Mise en cache
    if (element) {
      this.cache.set(cacheKey, element);
    }
    return element;
  }

  _mergeSelectors(custom, defaults) {
    return custom ? [custom, ...defaults] : defaults;
  }

  _extractChannelName(element) {
    return element?.textContent?.trim() || null;
  }

  _isChannelNameValid(name) {
    if (!name) return false;
    return !name.trim().startsWith('#');
  }

  async _getFallbackChannelElement() {
    const fallbackSelectors = this.config.SELECTORS.CHANNEL_NAME_FALLBACK || [];
    if (!fallbackSelectors.length) return null;

    return this._waitForElement(fallbackSelectors, 2000).catch(() => null);
  }

  _isButtonPressed(btn) {
    if (!btn) return false;
    return (
      btn.getAttribute('aria-pressed') === 'true' ||
      btn.classList.contains('style-default-active')
    );
  }

  _findFirstVisibleElement(selectorsList) {
    for (const selector of selectorsList) {
      try {
        const candidates = this._queryAllBySelector(selector);
        for (const el of candidates) {
          if (this._isVisible(el)) return el;
        }
      } catch (e) {
        // Ignorer sélecteurs invalides
        continue;
      }
    }
    return null;
  }

  _queryAllBySelector(selector) {
    if (!selector || typeof selector !== 'string') return [];

    if (this._isXPath(selector)) {
      return this._queryAllByXPath(selector);
    }

    return document.querySelectorAll(selector);
  }

  _isXPath(selector) {
    const trimmed = selector.trim();
    return trimmed.startsWith('/') || trimmed.startsWith('(');
  }

  _queryAllByXPath(xpath) {
    const snapshot = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    const elements = [];
    for (let i = 0; i < snapshot.snapshotLength; i += 1) {
      const node = snapshot.snapshotItem(i);
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        elements.push(node);
      }
    }

    return elements;
  }

  _waitForElement(selectorsList, timeoutMs) {
    return new Promise((resolve, reject) => {
      const immediate = this._findFirstVisibleElement(selectorsList);
      if (immediate) return resolve(immediate);

      let observer = null;
      let timer = null;

      const cleanup = () => {
        if (observer) observer.disconnect();
        if (timer) clearTimeout(timer);
      };

      observer = new MutationObserver(() => {
        const el = this._findFirstVisibleElement(selectorsList);
        if (el) {
          cleanup();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout searching element'));
      }, timeoutMs);
    });
  }

  _isVisible(el) {
    if (!el || !el.isConnected) return false;

    // Utilisation de l'API standard si disponible
    if (el.checkVisibility) {
      return el.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true
      });
    }

    // Fallback robuste
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }
}
