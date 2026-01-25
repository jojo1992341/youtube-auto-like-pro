/**
 * UTILITAIRE DOM (Interne)
 */
const h = (tag, className, text = '', attributes = {}) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
};

/**
 * SOUS-SYSTÈME : SÉLECTION MANUELLE
 * Gère l'overlay de repérage visuel (Highlighter).
 */
export class SelectionSystem {
    constructor(root) {
        this.root = root;
        this.banner = null;
        this.highlighter = null;
        this._injectedStyles = false;
    }

    enable() {
        this._ensureAssets();
        this.banner.style.display = 'block';
        this.highlighter.style.display = 'none';
    }

    disable() {
        if (this.banner) this.banner.style.display = 'none';
        if (this.highlighter) this.highlighter.style.display = 'none';
    }

    updateInstruction(text) {
        if (this.banner) this.banner.textContent = text;
    }

    highlight(rect) {
        this._ensureAssets();
        if (!this.highlighter) return;
        if (!rect) {
            this.highlighter.style.display = 'none';
            return;
        }
        Object.assign(this.highlighter.style, {
            display: 'block',
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
        });
    }

    _ensureAssets() {
        // Styles
        if (!this._injectedStyles) {
            const style = h('style', '', `
        .selection-banner { position: fixed; top: 0; left: 0; right: 0; background: #3ea6ff; color: white; text-align: center; padding: 16px; font-weight: 700; font-size: 16px; z-index: 2147483647; font-family: sans-serif; display: none; }
        .selection-highlighter { position: fixed; border: 4px solid #e74c3c; background: rgba(231, 76, 60, 0.2); pointer-events: none; z-index: 2147483646; transition: all 0.05s ease-out; border-radius: 4px; box-sizing: border-box; }
      `);
            this.root.appendChild(style);
            this._injectedStyles = true;
        }

        // Elements
        if (!this.banner) {
            this.banner = h('div', 'selection-banner');
            this.root.appendChild(this.banner);
        }
        if (!this.highlighter) {
            this.highlighter = h('div', 'selection-highlighter');
            this.root.appendChild(this.highlighter);
        }
    }
}
