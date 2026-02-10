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
     * Génère un sélecteur XPath absolu (full XPath) pour l'élément donné.
     * @param {HTMLElement} element - L'élément cible.
     * @returns {string} Le sélecteur XPath absolu.
     */
    generate(element) {
        return this._buildFullXPath(element);
    }

    /**
     * Construit un XPath absolu de type /html/body/div[2]/...
     * @param {HTMLElement} element
     * @returns {string}
     */
    _buildFullXPath(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';

        const segments = [];
        let current = element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
            const tagName = current.tagName.toLowerCase();

            // L'élément racine html n'a pas besoin d'index
            if (tagName === 'html') {
                segments.unshift('html');
                break;
            }

            const index = this._getElementIndexAmongSameTag(current);
            segments.unshift(`${tagName}[${index}]`);
            current = current.parentElement;
        }

        return `/${segments.join('/')}`;
    }

    _getElementIndexAmongSameTag(element) {
        let index = 1;
        let sibling = element.previousElementSibling;

        while (sibling) {
            if (sibling.tagName === element.tagName) {
                index += 1;
            }
            sibling = sibling.previousElementSibling;
        }

        return index;
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
