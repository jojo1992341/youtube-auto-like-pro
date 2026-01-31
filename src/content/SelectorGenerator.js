/**
 * GÉNÉRATEUR DE SÉLECTEURS (V4 - Pure Dynamic Chain)
 * Approche : "Bottom-Up Unique Chain"
 * Refactorisé pour être agnostique et configurable.
 */

const DEFAULT_OPTIONS = {
    // Classes à ignorer (Patterns ou préfixes)
    ignoredClassPatterns: [
        /^style-scope/,
        /^yt-spec-/,
        /^yt-simple-/,
        /^[0-9]/,         // Classes commençant par des chiffres
        /^.{40,}$/        // Hashes longs (>40 chars)
    ],
    // IDs à ignorer
    ignoredIdPatterns: [
        /\d{5,}/          // IDs avec longues séquences de chiffres
    ]
};

export class SelectorGenerator {

    /**
     * @param {Object} options - Configuration optionnelle pour surcharger les défauts.
     */
    constructor(options = {}) {
        this.config = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Génère un sélecteur CSS unique pour l'élément donné.
     * @param {HTMLElement} element - L'élément cible.
     * @returns {string} Le sélecteur CSS unique.
     */
    generate(element) {
        if (!element) return '';

        let path = [];
        let current = element;

        // Boucle de remontée vers la racine
        while (current && current !== document.body.parentElement) {
            // 1. Calculer l'identité locale de l'étape courante
            const localSelector = this._getLocalSelector(current);
            path.unshift(localSelector);

            // 2. Tester l'unicité du chemin complet actuel
            const fullSelector = path.join(' > '); // Liaison directe pour précision max
            const matches = document.querySelectorAll(fullSelector);

            if (matches.length === 1) {
                // VICTOIRE : Le sélecteur est unique, on s'arrête là.
                return fullSelector;
            }

            // Cas de sécurité : Si on est arrivé au body et que ce n'est toujours pas unique
            if (current === document.body) {
                // Impossible d'être unique structurellement
                return this._forceNthIndex(element, path);
            }

            // Sinon, on continue de monter pour trouver un ancêtre discriminant
            current = current.parentElement;
        }

        return path.join(' > '); // Fallback
    }

    /**
     * Crée un sélecteur simple pour un seul noeud.
     * Priorise ID > Classes > Tag > Attributs.
     */
    _getLocalSelector(element) {
        // 1. ID Stable (Priorité absolue)
        if (this._isIdValid(element.id)) {
            return `#${CSS.escape(element.id)}`;
        }

        // 2. Classes (Filtrage strict via config)
        const validClasses = this._getValidClasses(element);

        if (validClasses.length > 0) {
            const tagName = element.tagName.toLowerCase();
            return `${tagName}.${validClasses.map(c => CSS.escape(c)).join('.')}`;
        }

        // 3. Attributs (Fallback si pas de classe)
        return this._getAttributeSelector(element);
    }

    _isIdValid(id) {
        if (!id) return false;
        return !this.config.ignoredIdPatterns.some(pattern => pattern.test(id));
    }

    _getValidClasses(element) {
        return Array.from(element.classList).filter(cls => {
            return !this.config.ignoredClassPatterns.some(pattern => pattern.test(cls));
        });
    }

    _getAttributeSelector(element) {
        let selector = element.tagName.toLowerCase();

        // On privilégie 'role' comme identifiant sémantique robuste
        if (element.getAttribute('role')) {
            selector += `[role="${CSS.escape(element.getAttribute('role'))}"]`;
        }

        // Extension possible ici pour d'autres attributs stables (data-*, name, etc.)

        return selector;
    }

    /**
     * Ajoute un index :nth-of-type final si la structure seule ne suffit pas.
     */
    _forceNthIndex(targetElement, currentPath) {
        if (currentPath.length === 0) return '';

        const siblings = Array.from(targetElement.parentNode.children).filter(
            child => child.tagName === targetElement.tagName
        );

        const index = siblings.indexOf(targetElement) + 1;

        // On prend tout le chemin SAUF le dernier élément (la cible)
        const parentChain = currentPath.slice(0, -1);
        const lastSelector = currentPath[currentPath.length - 1];

        // Construction du sélecteur indexé
        const targetIndexed = `${lastSelector}:nth-of-type(${index})`;

        parentChain.push(targetIndexed);

        return parentChain.join(' > ');
    }
}
