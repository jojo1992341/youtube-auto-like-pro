/**
 * CONFIGURATION DOM PAR DÉFAUT
 * Centralisation des sélecteurs et paramètres temporels.
 * Séparé de l'implémentation pour permettre le remplacement ou les tests.
 */
export const DEFAULT_DOM_CONFIG = Object.freeze({
    TIMEOUTS: {
        ELEMENT_SEARCH: 5000,
        PLAYER_LOAD: 10000,
        CACHE_TTL: 2000,
        URL_POLLING: 1000
    },
    SELECTORS: {
        // Zero-Config : Aucun sélecteur par défaut.
        // L'utilisateur DOIT utiliser le Selecteur Manuel.
        TITLE: 'title',                   // Gardé car standard HTML
        
        // Actions principales
        LIKE_BUTTONS: [],
        DISLIKE_BUTTONS: [],
        CHANNEL_NAME: [],
        CHANNEL_NAME_FALLBACK: [
            'ytd-channel-name a',
            '#channel-name a',
            'ytd-video-owner-renderer a',
            '#owner ytd-channel-name a',
            '#owner #channel-name a'
        ],

        // Système de commentaires (Standards YouTube Desktop)
        COMMENT_PLACEHOLDER: [
            '#placeholder-area', 
            '#simple-box' // Variante parfois observée
        ],
        COMMENT_INPUT: [
            '#contenteditable-root',
            'div[contenteditable="true"]' // Fallback générique
        ],
        COMMENT_SUBMIT: [
            '#submit-button button', 
            'ytd-button-renderer#submit-button',
            'button[aria-label="Commenter"]' // Accessibilité
        ]
    }
});
