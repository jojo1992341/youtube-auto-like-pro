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
    return element?.textContent?.trim() || null;
  }

  async getChannelElement(customSelector = null) {
    const selectors = this._mergeSelectors(customSelector, this.config.SELECTORS.CHANNEL_NAME);

    try {
      return await this._waitForElement(selectors, this.config.TIMEOUTS.ELEMENT_SEARCH);
    } catch (e) {
      return null;
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
        const candidates = document.querySelectorAll(selector);
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
        reject(new Error('Timeout'));
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