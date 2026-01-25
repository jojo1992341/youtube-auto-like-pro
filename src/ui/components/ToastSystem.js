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
 * SOUS-SYSTÈME : NOTIFICATIONS (TOASTS)
 * Gère une file d'attente visuelle (max 3 items).
 */
export class ToastSystem {
    constructor(root) {
        this.root = root;
        this.activeToasts = new Set();
        this.MAX_TOASTS = 3;
    }

    show(message, type = 'info', duration = 4000) {
        if (this.activeToasts.size >= this.MAX_TOASTS) {
            // Suppression du plus vieux si saturation
            const oldest = this.activeToasts.values().next().value;
            if (oldest) this._removeToast(oldest);
        }

        const toast = h('div', `toast ${type}`, message);
        this.root.appendChild(toast);
        this.activeToasts.add(toast);

        // Animation Entrée
        requestAnimationFrame(() => {
            requestAnimationFrame(() => toast.classList.add('visible'));
        });

        // Auto-destruction
        setTimeout(() => this._removeToast(toast), duration);
    }

    _removeToast(toast) {
        if (!toast.isConnected) return;

        toast.classList.remove('visible');
        toast.addEventListener('transitionend', () => {
            if (toast.isConnected) toast.remove();
            this.activeToasts.delete(toast);
        }, { once: true });
    }

    clearAll() {
        this.activeToasts.forEach(t => t.remove());
        this.activeToasts.clear();
    }
}
