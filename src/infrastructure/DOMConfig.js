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
        LIKE_BUTTONS: [],
        DISLIKE_BUTTONS: [],
        CHANNEL_NAME: [],
        COMMENT_PLACEHOLDER: ['#placeholder-area', 'ytd-comment-simplebox-renderer #placeholder-area'],
        COMMENT_INPUT: ['#contenteditable-root', 'ytd-commentbox #contenteditable-root'],
        COMMENT_SUBMIT: ['#submit-button button', 'ytd-button-renderer#submit-button']
    }
});
