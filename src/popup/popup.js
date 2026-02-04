import { StorageService } from '../services/StorageService.js';
import { LIMITS, DEFAULTS, MESSAGES } from '../core/Constants.js';
import { OpenRouterModelsService } from '../services/OpenRouterModelsService.js';

/**
 * VUE (VIEW)
 * Responsable uniquement de l'affichage et de la manipulation du DOM.
 */
class PopupView {
  constructor() {
    // Cache DOM Elements
    this.dom = {
      inputs: {
        // Config Cœur
        enable: document.getElementById('enableCheck'),
        delay: document.getElementById('delayInput'),
        variation: document.getElementById('variationInput'),
        logLevel: document.getElementById('logLevel'),
        file: document.getElementById('importInput'),
        // Config IA (Nouveau)
        aiEnable: document.getElementById('aiEnableCheck'),
        aiApiKey: document.getElementById('aiApiKey'),
        aiModel: document.getElementById('aiModelSelect'),
        aiPrompt: document.getElementById('aiPrompt')
      },
      buttons: {
        save: document.getElementById('saveBtn'),
        resetStats: document.getElementById('resetStatsBtn'),
        clearWhitelist: document.getElementById('clearWhitelistBtn'),
        clearBlacklist: document.getElementById('clearBlacklistBtn'),
        export: document.getElementById('exportBtn'),
        import: document.getElementById('importBtn'),
        selectMode: document.getElementById('btnSelectMode'),
        diagnostic: document.getElementById('btnDiagnostic'),
        refreshModels: document.getElementById('refreshModelsBtn')
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
      modelStatus: document.getElementById('aiModelStatus'),
      // Sélection de tous les onglets
      tabs: document.querySelectorAll('.tab'),
      tabContents: document.querySelectorAll('.tab-content')
    };

    this.chartInstance = null;
    this._statusTimer = null;
  }

  // --- RENDU CONFIGURATION ---

  setConfigValues(config, aiConfig) {
    // Config Générale
    this.dom.inputs.enable.checked = config.isEnabled;
    this.dom.inputs.delay.value = config.baseDelay;
    this.dom.inputs.variation.value = config.variationPercent;
    if (config.logLevel) this.dom.inputs.logLevel.value = config.logLevel;

    // Config IA
    if (aiConfig) {
      this.dom.inputs.aiEnable.checked = aiConfig.isEnabled;
      this.dom.inputs.aiApiKey.value = aiConfig.apiKey || ''; // On affiche la clé (masquée par input type=password)
      this.dom.inputs.aiPrompt.value = aiConfig.systemPrompt || '';
    }
  }

  setModelOptions(models, selectedModel, defaultModel) {
    const select = this.dom.inputs.aiModel;
    if (!select) return;

    select.innerHTML = '';

    if (!models.length) {
      const fallbackValue = selectedModel || defaultModel || '';
      const option = document.createElement('option');
      option.value = fallbackValue;
      option.textContent = fallbackValue || 'Aucun modèle disponible';
      select.appendChild(option);
      select.value = fallbackValue;
      return;
    }

    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      const latencyText = Number.isFinite(model.latencyMs) ? ` • ${Math.round(model.latencyMs)}ms` : '';
      option.textContent = `${model.id}${latencyText}`;
      select.appendChild(option);
    });

    select.value = selectedModel || defaultModel || models[0].id;
  }

  setModelStatus(text, type = 'info') {
    if (!this.dom.modelStatus) return;
    this.dom.modelStatus.textContent = text;
    this.dom.modelStatus.dataset.type = type;
  }

  setModelLoading(isLoading) {
    if (!this.dom.buttons.refreshModels || !this.dom.inputs.aiModel) return;
    this.dom.buttons.refreshModels.disabled = isLoading;
    this.dom.inputs.aiModel.disabled = isLoading;
    this.dom.buttons.refreshModels.textContent = isLoading ? 'Chargement…' : '↻ Actualiser';
  }

  getFormValues() {
    return {
      config: {
        isEnabled: this.dom.inputs.enable.checked,
        baseDelay: parseInt(this.dom.inputs.delay.value, 10),
        variationPercent: parseInt(this.dom.inputs.variation.value, 10),
        logLevel: this.dom.inputs.logLevel.value
      },
      aiConfig: {
        isEnabled: this.dom.inputs.aiEnable.checked,
        apiKey: this.dom.inputs.aiApiKey.value.trim(),
        model: this.dom.inputs.aiModel.value.trim(),
        systemPrompt: this.dom.inputs.aiPrompt.value.trim()
      }
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

  /**
   * Gestion intelligente des onglets.
   * Sépare les groupes "Settings" (General/AI) des groupes "Stats" (Overview/History).
   */
  setActiveTab(clickedTab) {
    const tabName = clickedTab.dataset.tab;
    const isSettingsGroup = ['general', 'ai'].includes(tabName);
    
    const groupTabs = isSettingsGroup 
      ? ['general', 'ai'] 
      : ['overview', 'history'];

    // 1. Mise à jour des boutons (Classes active)
    this.dom.tabs.forEach(t => {
      if (groupTabs.includes(t.dataset.tab)) {
        t.classList.toggle('active', t.dataset.tab === tabName);
      }
    });

    // 2. Mise à jour du contenu
    groupTabs.forEach(name => {
      const content = document.getElementById(`tab-${name}`);
      if (content) {
        content.classList.toggle('active', name === tabName);
      }
    });
  }
}

/**
 * CONTRÔLEUR (CONTROLLER)
 */
class PopupController {
  constructor() {
    this.storage = new StorageService();
    this.modelsService = new OpenRouterModelsService();
    this.view = new PopupView();
    this.modelList = [];
    this.currentAIConfig = null;
    this._bindEvents();
  }

  async init() {
    try {
      await this.storage.init();
      await this.refreshAll();
      await this._refreshModels();

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') this.refreshAll();
      });
    } catch (e) {
      console.error(e);
      this.view.showStatus('Erreur de chargement', 'error');
    }
  }

  async refreshAll() {
    const [config, aiConfig, stats, history] = await Promise.all([
      this.storage.getConfig(),
      this.storage.getAIConfig(), // Nouveau
      this.storage.getStats(),
      this.storage.getHistory()
    ]);

    this.currentAIConfig = aiConfig;
    this.view.setConfigValues(config, aiConfig);
    this.view.updateStats(stats);
    this.view.renderHistory(history);
    this.view.renderList('whitelist', config.whitelist, (n) => this._removeItem('whitelist', n));
    this.view.renderList('blacklist', config.blacklist, (n) => this._removeItem('blacklist', n));

    if (this.modelList.length) {
      this.view.setModelOptions(this.modelList, aiConfig.model, this.modelList[0]?.id);
    }
  }

  _bindEvents() {
    const btns = this.view.dom.buttons;
    const inputs = this.view.dom.inputs;

    btns.save.onclick = () => this._handleSave();
    btns.resetStats.onclick = () => this._handleResetStats();
    btns.clearWhitelist.onclick = () => this._handleClearList('whitelist');
    btns.clearBlacklist.onclick = () => this._handleClearList('blacklist');
    btns.export.onclick = () => this._handleExport();
    btns.selectMode.onclick = () => this._handleSelectMode();
    btns.diagnostic.onclick = () => this._handleDiagnostic();
    btns.refreshModels.onclick = () => this._refreshModels(true);

    btns.import.onclick = () => inputs.file.click();
    inputs.file.onchange = (e) => this._handleImport(e);

    // Gestion unifiée des onglets
    this.view.dom.tabs.forEach(tab => {
      tab.onclick = (e) => this.view.setActiveTab(e.target);
    });
  }

  // --- ACTIONS ---

  async _handleSave() {
    try {
      const form = this.view.getFormValues();
      const { config, aiConfig } = form;

      // Validation Config Cœur
      let delay = config.baseDelay;
      let variation = config.variationPercent;

      if (isNaN(delay)) delay = DEFAULTS.CONFIG.baseDelay;
      if (isNaN(variation)) variation = DEFAULTS.CONFIG.variationPercent;

      delay = Math.max(LIMITS.DELAY.MIN, Math.min(delay, LIMITS.DELAY.MAX));
      variation = Math.max(LIMITS.VARIATION.MIN, Math.min(variation, LIMITS.VARIATION.MAX));

      // Sauvegarde Config Cœur
      await this.storage.updateConfig({
        isEnabled: config.isEnabled,
        baseDelay: delay,
        variationPercent: variation,
        logLevel: config.logLevel
      });

      // Sauvegarde Config IA (Nouveau)
      await this.storage.updateAIConfig({
        isEnabled: aiConfig.isEnabled,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model || DEFAULTS.AI_CONFIG.model,
        systemPrompt: aiConfig.systemPrompt || DEFAULTS.AI_CONFIG.systemPrompt
      });

      // Refresh UI pour clamp values
      this.view.dom.inputs.delay.value = delay;
      this.view.dom.inputs.variation.value = variation;

      this.view.showStatus('Configuration sauvegardée', 'success');
    } catch (error) {
      console.error(error);
      this.view.showStatus('Erreur sauvegarde', 'error');
    }
  }

  async _refreshModels(userInitiated = false) {
    try {
      this.view.setModelLoading(true);

      const models = await this.modelsService.listFreeModels();
      this.modelList = models;

      const defaultModel = models[0]?.id || '';
      const storedModel = this.currentAIConfig?.model || '';
      const isStoredAvailable = models.some((model) => model.id === storedModel);
      const selectedModel = isStoredAvailable ? storedModel : defaultModel || storedModel;

      this.view.setModelOptions(models, selectedModel, defaultModel);

      const statusText = models.length
        ? `Triés par latence • ${models.length} modèles • Défaut: ${defaultModel || '—'}`
        : 'Aucun modèle :free détecté.';

      this.view.setModelStatus(statusText, models.length ? 'info' : 'warning');
      if (userInitiated) {
        this.view.showStatus('Liste des modèles mise à jour', 'success');
      }
    } catch (error) {
      console.error(error);
      this.view.setModelStatus('Impossible de récupérer les modèles OpenRouter.', 'error');
      if (userInitiated) {
        this.view.showStatus('Erreur récupération modèles', 'error');
      }
    } finally {
      this.view.setModelLoading(false);
    }
  }

  // ... (Méthodes _handleResetStats, _removeItem, _handleClearList inchangées, on garde le code existant mais non répété pour brièveté si elles sont identiques à la V5.2. Je les réinclus pour être complet)
  
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
      window.close();
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
      await chrome.tabs.sendMessage(tab.id, { type: MESSAGES.START_DIAGNOSTIC });
      window.close();
    } catch (e) {
      this.view.showStatus('Erreur: Extension inactive sur cet onglet', 'error');
    }
  }

  async _handleExport() {
    try {
      const data = {
        meta: { version: '5.3.0', exportedAt: new Date().toISOString() },
        config: await this.storage.getConfig(),
        aiConfig: await this.storage.getAIConfig(), // Inclusion de l'IA dans l'export
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

      if (!json.config) throw new Error('Format invalide');

      const current = await this.storage.getConfig();
      const currentAI = await this.storage.getAIConfig();

      const merged = {
        ...current,
        ...json.config,
        whitelist: [...new Set([...current.whitelist, ...json.config.whitelist])],
        blacklist: [...new Set([...current.blacklist, ...json.config.blacklist])],
        customSelectors: { ...current.customSelectors, ...(json.config.customSelectors || {}) }
      };

      await this.storage.updateConfig(merged);

      // Import IA si présent
      if (json.aiConfig) {
        const mergedAI = { ...currentAI, ...json.aiConfig };
        await this.storage.updateAIConfig(mergedAI);
      }

      this.view.showStatus('Import réussi', 'success');
      event.target.value = '';
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
