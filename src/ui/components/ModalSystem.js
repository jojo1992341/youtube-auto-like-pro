import { logger } from '../../infrastructure/logger.js';

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
 * SOUS-SYSTÈME : POPUPS MODALES
 * Gère les interactions bloquantes via Promesses.
 */
export class ModalSystem {
    constructor(root) {
        this.root = root;
        this.activeModal = null;
    }

    askConsent(channelName) {
        return new Promise((resolve) => {
            if (this.activeModal) {
                logger.warn('Une modale est déjà active.');
                return resolve({ shouldLike: false, remember: false });
            }

            // Construction UI
            const overlay = h('div', 'popup-overlay');
            overlay.style.pointerEvents = 'auto'; // Bloque les clics en dessous

            const card = h('div', 'popup-card', '', { role: 'dialog', 'aria-modal': 'true' });
            const title = h('h3', 'popup-title', 'Liker cette vidéo ?');

            const text = h('p', 'popup-text', 'Chaîne : ');
            const safeName = channelName.length > 50 ? channelName.substring(0, 47) + '...' : channelName;
            text.appendChild(h('span', 'popup-channel', safeName));

            // Checkbox Remember
            const optionsDiv = h('div', 'popup-options');
            const label = h('label', 'popup-label');
            const checkbox = h('input', 'popup-checkbox', '', { type: 'checkbox' });
            label.append(checkbox, h('span', '', 'Se souvenir de mon choix'));
            optionsDiv.appendChild(label);

            // Actions
            const actionsDiv = h('div', 'popup-actions');
            const btnNo = h('button', 'btn btn-deny', '👎 Je n\'aime pas');
            // Force le rouge pour le bouton "Je n'aime pas"
            btnNo.style.backgroundColor = '#d32f2f';
            btnNo.style.color = '#ffffff';

            const btnYes = h('button', 'btn btn-confirm', 'J\'aime 👍');
            actionsDiv.append(btnNo, btnYes);

            card.append(title, text, optionsDiv, actionsDiv);
            overlay.appendChild(card);
            this.root.appendChild(overlay);
            this.activeModal = overlay;

            // Logique de fermeture
            const close = (result) => {
                const remember = checkbox.checked;
                overlay.style.opacity = '0';
                card.style.transform = 'scale(0.95)';

                setTimeout(() => {
                    overlay.remove();
                    this.activeModal = null;
                }, 200);

                // Cleanup listeners
                document.removeEventListener('keydown', handleKey);
                resolve({ shouldLike: result, remember });
            };

            // Events
            btnYes.onclick = () => close(true);
            btnNo.onclick = () => close(false);
            overlay.onclick = (e) => { if (e.target === overlay) close(false); };

            const handleKey = (e) => {
                if (e.key === 'Escape') close(false);
            };
            document.addEventListener('keydown', handleKey);

            // Focus
            setTimeout(() => btnYes.focus(), 50);
        });
    }
}
