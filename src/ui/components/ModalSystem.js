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

    /**
     * Demande le consentement pour Liker/Disliker.
     */
    askConsent(channelName) {
        return new Promise((resolve) => {
            if (this.activeModal) {
                logger.warn('Une modale est déjà active.');
                return resolve({ shouldLike: false, remember: false });
            }

            // Construction UI
            const overlay = h('div', 'popup-overlay');
            overlay.style.pointerEvents = 'auto';

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
                this._animateClose(overlay, card, () => resolve({ shouldLike: result, remember }));
            };

            // Events
            btnYes.onclick = () => close(true);
            btnNo.onclick = () => close(false);
            overlay.onclick = (e) => { if (e.target === overlay) close(false); };

            const handleKey = (e) => {
                if (e.key === 'Escape') close(false);
            };
            document.addEventListener('keydown', handleKey);

            setTimeout(() => btnYes.focus(), 50);
        });
    }

    /**
     * NOUVEAU : Demande validation avec choix multiple pour un commentaire IA.
     * @param {string} channelName 
     * @param {string[]} suggestions - Tableau des suggestions générées
     * @returns {Promise<{confirmed: boolean, finalComment: string}>}
     */
    askCommentValidation(channelName, suggestions) {
        return new Promise((resolve) => {
            if (this.activeModal) {
                logger.warn('Une modale est déjà active (Commentaire ignoré).');
                return resolve({ confirmed: false, finalComment: '' });
            }

            // Normalisation : on s'assure d'avoir un tableau
            const safeSuggestions = Array.isArray(suggestions) ? suggestions : [suggestions];
            // Premier choix par défaut
            let currentSelection = safeSuggestions[0] || '';

            const overlay = h('div', 'popup-overlay');
            overlay.style.pointerEvents = 'auto';

            const card = h('div', 'popup-card', '', { role: 'dialog', 'aria-modal': 'true' });
            
            // En-tête
            const title = h('h3', 'popup-title', '🤖 Choisir un commentaire');
            title.style.color = '#3ea6ff'; 

            const text = h('p', 'popup-text', 'Suggestions pour : ');
            const safeName = channelName.length > 50 ? channelName.substring(0, 47) + '...' : channelName;
            text.appendChild(h('span', 'popup-channel', safeName));

            // Zone principale
            const optionsDiv = h('div', 'popup-options');

            // 1. Liste des suggestions (Scrollable)
            const listContainer = h('div', 'suggestion-list');
            
            // 2. Zone d'édition finale (Textarea)
            const textarea = h('textarea', '', currentSelection, {
                rows: '3',
                placeholder: 'Votre commentaire final...'
            });
            Object.assign(textarea.style, {
                width: '100%',
                background: '#121212',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '8px',
                padding: '12px',
                fontFamily: 'inherit',
                fontSize: '13px',
                resize: 'vertical',
                minHeight: '60px'
            });

            // Génération des cartes
            safeSuggestions.forEach((suggestion, index) => {
                const item = h('div', 'suggestion-card', suggestion);
                
                // Sélectionner le premier par défaut
                if (index === 0) item.classList.add('selected');

                item.onclick = () => {
                    // Update visuel
                    listContainer.querySelectorAll('.suggestion-card').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    
                    // Update logique
                    currentSelection = suggestion;
                    textarea.value = suggestion;
                    
                    // Petit effet visuel sur le textarea pour montrer le changement
                    textarea.style.borderColor = '#3ea6ff';
                    setTimeout(() => textarea.style.borderColor = '#444', 300);
                };

                listContainer.appendChild(item);
            });

            optionsDiv.append(listContainer, textarea);

            // Actions
            const actionsDiv = h('div', 'popup-actions');
            const btnCancel = h('button', 'btn btn-deny', 'Annuler');
            const btnPost = h('button', 'btn btn-confirm', 'Poster 🚀');

            actionsDiv.append(btnCancel, btnPost);
            card.append(title, text, optionsDiv, actionsDiv);
            overlay.appendChild(card);
            
            this.root.appendChild(overlay);
            this.activeModal = overlay;

            const close = (confirmed) => {
                const finalComment = textarea.value.trim();
                this._animateClose(overlay, card, () => resolve({ confirmed, finalComment }));
            };

            btnPost.onclick = () => close(true);
            btnCancel.onclick = () => close(false);
            overlay.onclick = (e) => { if (e.target === overlay) close(false); };
            
            // Focus sur le bouton poster pour une validation rapide
            setTimeout(() => btnPost.focus(), 50);
        });
    }

    _animateClose(overlay, card, callback) {
        overlay.style.opacity = '0';
        card.style.transform = 'scale(0.95)';

        setTimeout(() => {
            overlay.remove();
            this.activeModal = null;
            callback();
        }, 200);
    }
}