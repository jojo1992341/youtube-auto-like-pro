/**
 * SOUS-SYSTÈME : HÔTE SHADOW DOM
 * Responsable de l'isolation CSS.
 */
export class ShadowHost {
    constructor() {
        this.hostId = 'alp-overlay-host';
        this.root = null;
        this._init();
    }

    get shadowRoot() {
        return this.root;
    }

    _init() {
        let host = document.getElementById(this.hostId);
        if (!host) {
            host = document.createElement('div');
            host.id = this.hostId;
            Object.assign(host.style, {
                position: 'fixed',
                top: '0', left: '0', width: '0', height: '0',
                zIndex: '2147483647',
                pointerEvents: 'none'
            });
            document.body.appendChild(host);
            this.root = host.attachShadow({ mode: 'open' });
            this._injectCSS();
        } else {
            this.root = host.shadowRoot;
        }
    }

    _injectCSS() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('assets/styles/overlay.css');
        this.root.appendChild(link);
    }
}
