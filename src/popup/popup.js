import { StorageService } from '../services/StorageService.js';
import { LIMITS, DEFAULTS, MESSAGES } from '../core/Constants.js';

/**
 * VUE (VIEW)
 * Responsable uniquement de l'affichage et de la manipulation du DOM.
 * Ne contient AUCUNE logique métier.
 */
class PopupView {
  constructor() {
    // Cache DOM Elements
    this.dom = {
      inputs: {
        enable: document.getElementById('enableCheck'),
        delay: document.getElementById('delayInput'),
        variation: document.getElementById('variationInput'),
        logLevel: document.getElementById('logLevel'),
        file: document.getElementById('importInput')
      },
      buttons: {
        save: document.getElementById('saveBtn'),
        resetStats: document.getElementById('resetStatsBtn'),
        clearWhitelist: document.getElementById('clearWhitelistBtn'),
        clearBlacklist: document.getElementById('clearBlacklistBtn'),
        export: document.getElementById('exportBtn'),
        import: document.getElementById('importBtn'),
        selectMode: document.getElementById('btnSelectMode'),
        diagnostic: document.getElementById('btnDiagnostic')
      },
      stats: {
        total: document.getElementById('totalLikes'),
        auto: document.getElementById('autoLikes'),
        manual: document.getElementById('manualLikes'),
        skipped: document.getElementById('skipped')
      },
      containers: {
        whitelist: document.getElementById('whitelistContainer'),
        blacklist: document.getElementById('blacklistContainer'),
        history: document.getElementById('historyContainer'),
        chartCtx: document.getElementById('likesChart')
      },
      badges: {
        whitelist: document.getElementById('whitelistCount'),
        blacklist: document.getElementById('blacklistCount')
      },
      status: document.getElementById('status'),
      tabs: document.querySelectorAll('.tab'),
      tabContents: document.querySelectorAll('.tab-content')
    };

    this.chartInstance = null;
    this._statusTimer = null;
  }

  // --- RENDU CONFIGURATION ---

  setConfigValues(config) {
    this.dom.inputs.enable.checked = config.isEnabled;
    this.dom.inputs.delay.value = config.baseDelay;
    this.dom.inputs.variation.value = config.variationPercent;
    if (config.logLevel) this.dom.inputs.logLevel.value = config.logLevel;
  }

  getFormValues() {
    return {
      isEnabled: this.dom.inputs.enable.checked,
      baseDelay: parseInt(this.dom.inputs.delay.value, 10),
      variationPercent: parseInt(this.dom.inputs.variation.value, 10),
      logLevel: this.dom.inputs.logLevel.value
    };
  }

  // --- RENDU STATS & CHART ---

  updateStats(stats) {
    this.dom.stats.total.textContent = stats.total;
    this.dom.stats.auto.textContent = stats.auto;
    this.dom.stats.manual.textContent = stats.manual;
    this.dom.stats.skipped.textContent = stats.skipped;

    this._renderChart(stats);
  }

  _renderChart(stats) {
    if (typeof Chart === 'undefined' || !this.dom.containers.chartCtx) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    this.chartInstance = new Chart(this.dom.containers.chartCtx, {
      type: 'doughnut',
      data: {
        labels: ['Auto', 'Manuel', 'Ignorés'],
        datasets: [{
          data: [stats.auto, stats.manual, stats.skipped],
          backgroundColor: ['#2ecc71', '#3498db', '#e74c3c'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: { enabled: true }
        },
        animation: { duration: 400 }
      }
    });
  }

  // --- RENDU LISTES & HISTORIQUE ---

  renderList(type, list, onRemove) {
    const container = this.dom.containers[type];
    const badge = this.dom.badges[type];

    container.innerHTML = '';
    badge.textContent = list.length;

    if (list.length === 0) {
      container.innerHTML = '<div class="empty-list">Aucune chaîne</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    [...list].sort((a, b) => a.localeCompare(b)).forEach(name => {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `<span class="list-item-name" title="${name}">${name}</span>`;

      const btn = document.createElement('button');
      btn.className = 'remove-btn';
      btn.textContent = '×';
      btn.onclick = () => onRemove(name);

      row.appendChild(btn);
      fragment.appendChild(row);
    });
    container.appendChild(fragment);
  }

  renderHistory(history) {
    const container = this.dom.containers.history;
    container.innerHTML = '';

    if (!history.length) {
      container.innerHTML = '<div class="no-history">Historique vide</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    history.forEach(entry => {
      if (!entry || !entry.videoId) return;
      const item = document.createElement('div');
      item.className = 'history-item';

      // Sécurisation basique contre XSS via textContent
      const title = document.createElement('div');
      title.className = 'history-item-title';
      title.textContent = entry.videoTitle || 'Vidéo inconnue';

      const meta = document.createElement('div');
      meta.className = 'history-item-meta';

      const channel = document.createElement('span');
      channel.textContent = entry.channelName || 'Inconnu';

      const time = document.createElement('span');
      time.textContent = new Date(entry.timestamp).toLocaleTimeString();

      meta.append(channel, time);
      item.append(title, meta);
      fragment.appendChild(item);
    });
    container.appendChild(fragment);
  }

  // --- UI UTILS ---

  showStatus(msg, type) {
    const el = this.dom.status;
    el.textContent = msg;
    el.className = type;
    el.style.opacity = '1';

    if (this._statusTimer) clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }

  setActiveTab(tabName) {
    this.dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    this.dom.tabContents.forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
  }
}

/**
 * CONTRÔLEUR (CONTROLLER)
 * Orchestre la logique et détient l'instance de Service.
 */
class PopupController {
  constructor() {
    this.storage = new StorageService();
    this.view = new PopupView();
    this._bindEvents();
  }

  async init() {
    try {
      await this.storage.init();
      await this.refreshAll();

      // Écoute des changements externes (ex: background update)
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') this.refreshAll();
      });
    } catch (e) {
      console.error(e);
      this.view.showStatus('Erreur de chargement', 'error');
    }
  }

  async refreshAll() {
    const [config, stats, history] = await Promise.all([
      this.storage.getConfig(),
      this.storage.getStats(),
      this.storage.getHistory()
    ]);

    this.view.setConfigValues(config);
    this.view.updateStats(stats);
    this.view.renderHistory(history);
    this.view.renderList('whitelist', config.whitelist, (n) => this._removeItem('whitelist', n));
    this.view.renderList('blacklist', config.blacklist, (n) => this._removeItem('blacklist', n));
  }

  _bindEvents() {
    // ... (bindEvents unchanged logic, referencing this._handleXXX)
    const btns = this.view.dom.buttons;
    const inputs = this.view.dom.inputs;

    btns.save.onclick = () => this._handleSave();
    btns.resetStats.onclick = () => this._handleResetStats();
    btns.clearWhitelist.onclick = () => this._handleClearList('whitelist');
    btns.clearBlacklist.onclick = () => this._handleClearList('blacklist');
    btns.export.onclick = () => this._handleExport();
    btns.selectMode.onclick = () => this._handleSelectMode();
    btns.diagnostic.onclick = () => this._handleDiagnostic();

    // Import (Trick du file input caché)
    btns.import.onclick = () => inputs.file.click();
    inputs.file.onchange = (e) => this._handleImport(e);

    // Onglets
    this.view.dom.tabs.forEach(tab => {
      tab.onclick = (e) => this.view.setActiveTab(e.target.dataset.tab);
    });
  }

  // --- ACTIONS ---

  async _handleSave() {
    try {
      const form = this.view.getFormValues();

      // Validation
      let delay = form.baseDelay;
      let variation = form.variationPercent;

      if (isNaN(delay)) delay = DEFAULTS.CONFIG.baseDelay;
      if (isNaN(variation)) variation = DEFAULTS.CONFIG.variationPercent;

      // Clamping strict
      delay = Math.max(LIMITS.DELAY.MIN, Math.min(delay, LIMITS.DELAY.MAX));
      variation = Math.max(LIMITS.VARIATION.MIN, Math.min(variation, LIMITS.VARIATION.MAX));

      // Sauvegarde
      await this.storage.updateConfig({
        isEnabled: form.isEnabled,
        baseDelay: delay,
        variationPercent: variation,
        logLevel: form.logLevel
      });

      // Update UI immédiat pour refléter les valeurs clampées
      this.view.dom.inputs.delay.value = delay;
      this.view.dom.inputs.variation.value = variation;

      this.view.showStatus('Configuration sauvegardée', 'success');
    } catch (error) {
      this.view.showStatus('Erreur sauvegarde', 'error');
    }
  }

  async _handleResetStats() {
    if (!confirm('Réinitialiser les statistiques à zéro ?')) return;
    await this.storage.resetStats();
    this.view.showStatus('Statistiques remises à zéro', 'success');
  }

  async _removeItem(type, name) {
    const config = await this.storage.getConfig();
    const newList = config[type].filter(n => n !== name);
    await this.storage.updateConfig({ [type]: newList });
  }

  async _handleClearList(type) {
    const config = await this.storage.getConfig();
    if (config[type].length === 0) return;

    if (confirm(`Vider toute la liste ${type} ?`)) {
      await this.storage.updateConfig({ [type]: [] });
      this.view.showStatus('Liste vidée', 'success');
    }
  }

  async _handleSelectMode() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url.includes('youtube.com')) {
      this.view.showStatus('Allez sur YouTube d\'abord', 'warning');
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { type: MESSAGES.START_SELECTION_MODE });
      window.close(); // Ferme la popup pour laisser l'user agir
    } catch (e) {
      this.view.showStatus('Erreur communication page', 'error');
    }
  }

  async _handleDiagnostic() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url.includes('youtube.com')) {
      this.view.showStatus('Allez sur YouTube d\'abord', 'warning');
      return;
    }

    try {
      // On envoie le message de diagnostic
      // Note: On ne ferme pas la popup tout de suite, on attend un retour ou on laisse l'user voir le toast
      await chrome.tabs.sendMessage(tab.id, { type: MESSAGES.START_DIAGNOSTIC });
      window.close();
    } catch (e) {
      this.view.showStatus('Erreur: Extension inactive sur cet onglet', 'error');
    }
  }

  // --- IMPORT / EXPORT ---

  async _handleExport() {
    try {
      const data = {
        meta: { version: '5.2.0', exportedAt: new Date().toISOString() },
        config: await this.storage.getConfig(),
        stats: await this.storage.getStats()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autolike-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      this.view.showStatus('Export réussi', 'success');
    } catch (e) {
      this.view.showStatus('Erreur export', 'error');
    }
  }

  async _handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!json.config || !Array.isArray(json.config.whitelist)) {
        throw new Error('Format invalide');
      }

      const current = await this.storage.getConfig();

      // Fusion sécurisée
      const merged = {
        ...current,
        ...json.config,
        whitelist: [...new Set([...current.whitelist, ...json.config.whitelist])],
        blacklist: [...new Set([...current.blacklist, ...json.config.blacklist])],
        customSelectors: { ...current.customSelectors, ...(json.config.customSelectors || {}) }
      };

      await this.storage.updateConfig(merged);
      this.view.showStatus('Import réussi', 'success');
      event.target.value = ''; // Reset input
    } catch (e) {
      console.error(e);
      this.view.showStatus('Fichier invalide', 'error');
    }
  }
}

// Bootstrapper
document.addEventListener('DOMContentLoaded', () => {
  new PopupController().init();
});