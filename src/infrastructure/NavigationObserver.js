import { logger } from './logger.js';

/**
 * OBSERVATEUR DE NAVIGATION (SPA AWARE)
 * Responsabilité unique : Détecter les changements de vidéo sur une Single Page Application.
 * Supporte : Navigation URL, Historique HTML5, Mutation de Titre.
 */
export class NavigationObserver {
    /**
     * @param {Object} config - Configuration des délais et sélecteurs
     */
    constructor(config) {
        this.config = config;
        this.currentVideoId = null;
        this._observers = new Set();
        this._pollingInterval = null;
        this._onVideoChanged = null;

        // Bindings
        this._handleTitleMutation = this._handleTitleMutation.bind(this);
        this._checkVideoIdChange = this._checkVideoIdChange.bind(this);
    }

    /**
     * Commence la surveillance.
     * @param {Function} callback - Fonction appelée lors d'un changement de vidéo ({ videoId })
     */
    start(callback) {
        if (typeof callback !== 'function') {
            throw new Error('[NavigationObserver] Callback requis.');
        }

        this._onVideoChanged = callback;

        // Vérification initiale
        this._checkVideoIdChange();

        // Stratégie 1 : MutationObserver sur <title> (Très efficace pour YouTube)
        // YouTube met à jour le <title> à chaque navigation virtuelle.
        const titleNode = document.querySelector('title'); // Standard HTML toujours présent
        if (titleNode) {
            const obs = new MutationObserver(this._handleTitleMutation);
            obs.observe(titleNode, { childList: true });
            this._observers.add(obs);
        } else {
            logger.warn('[NavigationObserver] <title> introuvable, fallback polling activé.');
        }

        // Stratégie 2 : Polling URL de sécurité (Fallback robuste)
        // Au cas où le MutationObserver rate un événement ou pour les cas limites.
        this._pollingInterval = setInterval(
            this._checkVideoIdChange,
            this.config.TIMEOUTS.URL_POLLING || 1000
        );
    }

    /**
     * Arrête toute surveillance.
     */
    stop() {
        this._observers.forEach(obs => obs.disconnect());
        this._observers.clear();

        if (this._pollingInterval) {
            clearInterval(this._pollingInterval);
            this._pollingInterval = null;
        }

        this._onVideoChanged = null;
    }

    /**
     * Vérifie si l'ID de la vidéo a changé via l'URL.
     * @private
     */
    _checkVideoIdChange() {
        // Extraction propre via URLSearchParams
        const params = new URLSearchParams(window.location.search);
        const newId = params.get('v');
        const isWatchPage = window.location.pathname.includes('/watch');

        // On ne réagit que si on est sur une page de lecture et que l'ID a changé
        if (!isWatchPage || !newId || newId === this.currentVideoId) {
            return;
        }

        logger.info(`[NavigationObserver] Changement détecté : ${this.currentVideoId} -> ${newId}`);
        this.currentVideoId = newId;

        if (this._onVideoChanged) {
            this._onVideoChanged({ videoId: newId });
        }
    }

    /**
     * Réaction aux changements du titre de la page.
     * Utilise queueMicrotask pour laisser le temps à l'URL de se mettre à jour.
     * @private
     */
    _handleTitleMutation() {
        queueMicrotask(this._checkVideoIdChange);
    }
}
