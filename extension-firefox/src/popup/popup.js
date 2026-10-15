// popup.js — Prompt Enhancer
// Phase 2 + Phase 3 + Complete Visual Redesign
// Strict MV3 CSP compliant: no inline event handlers, zero emojis, rich SVG icons.

/* global PE, chrome */

'use strict';

(function () {

  // ---------------------------------------------------------------------------
  // Reusable SVG Icon Templates (Zero-Emoji Policy)
  // ---------------------------------------------------------------------------
  var SVG_CHECK = '<svg class="pe-svg-status pe-svg--ok" viewBox="0 0 20 20" width="13" height="13" fill="none"><circle cx="10" cy="10" r="9" fill="#10B981" fill-opacity="0.18" stroke="#10B981" stroke-width="1.6"/><path d="M6 10.2l2.6 2.6 5.4-5.6" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var SVG_ERROR = '<svg class="pe-svg-status pe-svg--error" viewBox="0 0 20 20" width="13" height="13" fill="none"><circle cx="10" cy="10" r="8" fill="#EF4444" fill-opacity="0.15" stroke="#EF4444" stroke-width="1.8"/><line x1="10" y1="6" x2="10" y2="10" stroke="#EF4444" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14" r="1" fill="#EF4444"/></svg>';
  var SVG_WARN  = '<svg class="pe-svg-status pe-svg--warn" viewBox="0 0 20 20" width="13" height="13" fill="none"><path d="M10 2.5L1.5 17.5h17L10 2.5z" fill="#F59E0B" fill-opacity="0.15" stroke="#F59E0B" stroke-width="1.8" stroke-linejoin="round"/><line x1="10" y1="8" x2="10" y2="12" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="15" r="1" fill="#F59E0B"/></svg>';

  var SVG_BOLT = '<svg class="pe-svg-bolt" viewBox="0 0 24 24" width="14" height="14" fill="#F59E0B" stroke="#F59E0B" stroke-width="1.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  var SVG_WAND_HERO = '<svg class="pe-btn-icon pe-svg-wand" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l9-9"/><path d="M13 11l-1-1L15.5 6.5l2 2L14 12l-1-1z" fill="currentColor"/><path d="M19 2l.5 1.2L20.7 3.7l-1.2.5L19 5.4l-.5-1.2L17.3 3.7l1.2-.5L19 2z" fill="currentColor"/><path d="M8 3l.4 1L9.4 4.4l-1 .4L8 5.8l-.4-1L6.6 4.4l1-.4L8 3z" fill="currentColor"/></svg>';
  var SVG_WAND_SM = '<svg class="pe-svg-wand" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l9-9"/><path d="M13 11l-1-1L15.5 6.5l2 2L14 12l-1-1z" fill="currentColor"/><path d="M19 2l.5 1.2L20.7 3.7l-1.2.5L19 5.4l-.5-1.2L17.3 3.7l1.2-.5L19 2z" fill="currentColor"/></svg>';
  var SVG_PEN_ROSE = '<svg class="pe-svg-pen" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#F43F5E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  var SVG_COPY_CYAN_SM = '<svg class="pe-svg-copy" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var SVG_COPY_CYAN_MD = '<svg class="pe-svg-copy" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  var SVG_EYE_OPEN = '<svg class="pe-svg-eye" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var SVG_EYE_CLOSED = '<svg class="pe-svg-eye" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  var SVG_RELOAD = '<svg class="pe-svg-reload" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>';
  var SVG_RELOAD_SPIN = '<svg class="pe-svg-reload pe-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>';
  var SVG_CHAT = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#C084FC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  // ---------------------------------------------------------------------------
  // DOM Element References (All 46 Required IDs)
  // ---------------------------------------------------------------------------
  var tabEnhance        = document.getElementById('tab-enhance');
  var tabSettings       = document.getElementById('tab-settings');
  var panelEnhance      = document.getElementById('panel-enhance');
  var panelSettings     = document.getElementById('panel-settings');
  var welcomeNote       = document.getElementById('welcome-note');

  var siteStatus        = document.getElementById('site-status');
  var draftStatus       = document.getElementById('draft-status');
  var contextStatusRow  = document.getElementById('context-status-row');
  var contextStatus     = document.getElementById('context-status');
  var btnEnhance        = document.getElementById('btn-enhance');
  var shortcutHint      = document.getElementById('shortcut-hint');
  var linkShortcuts     = document.getElementById('link-shortcuts');
  var activeModelChip   = document.getElementById('active-model-chip');
  var btnCopyLast       = document.getElementById('btn-copy-last');

  var manualToggle      = document.getElementById('manual-toggle');
  var manualSection     = document.getElementById('manual-section');
  var manualInput       = document.getElementById('manual-input');
  var btnManualEnhance  = document.getElementById('btn-manual-enhance');
  var btnManualGrammar  = document.getElementById('btn-manual-grammar');
  var manualOutput      = document.getElementById('manual-output');
  var btnManualCopy     = document.getElementById('btn-manual-copy');
  var manualStatus      = document.getElementById('manual-status');

  var selectProvider    = document.getElementById('select-provider');
  var rowBaseUrl        = document.getElementById('row-base-url');
  var inputBaseUrl      = document.getElementById('input-base-url');
  var inputApiKey       = document.getElementById('input-api-key');
  var btnToggleKey      = document.getElementById('btn-toggle-key');
  var linkGetKey        = document.getElementById('link-get-key');
  var savedKeyHint      = document.getElementById('saved-key-hint');
  var btnTest           = document.getElementById('btn-test');
  var testStatus        = document.getElementById('test-status');
  var testDetails       = document.getElementById('test-details');
  var inputModel        = document.getElementById('input-model');
  var datalistModels    = document.getElementById('datalist-models');
  var btnLoadModels     = document.getElementById('btn-load-models');
  var modelsStatus      = document.getElementById('models-status');
  var selectStyle       = document.getElementById('select-style');
  var checkboxIncludeContext = document.getElementById('checkbox-include-context');
  var checkboxMarkdownSymbols = document.getElementById('checkbox-markdown-symbols');
  var checkboxAlwaysIncludeRole = document.getElementById('checkbox-always-include-role');
  var inputRules        = document.getElementById('input-rules');
  var rulesCounter      = document.getElementById('rules-counter');
  var advancedToggle    = document.getElementById('advanced-toggle');
  var advancedSection   = document.getElementById('advanced-section');
  var inputTemperature  = document.getElementById('input-temperature');
  var temperatureValue  = document.getElementById('temperature-value');
  var inputMaxTokens    = document.getElementById('input-max-tokens');
  var btnSave           = document.getElementById('btn-save');
  var btnReset          = document.getElementById('btn-reset');
  var unsavedIndicator  = document.getElementById('unsaved-indicator');
  var saveStatus        = document.getElementById('save-status');
  var footerVersion     = document.getElementById('footer-version');

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var savedSettings = null; // Clean baseline from storage
  var drafts = {            // Unsaved per-provider form drafts
    openrouter: { apiKey: '', model: '' },
    opencode:   { apiKey: '', model: '' },
    custom:     { apiKey: '', model: '', baseUrl: '' }
  };
  var modelsCache = {};     // In-memory model cache for current popup lifecycle
  var lastPingResponse = null; // Last detected page target status

  // ---------------------------------------------------------------------------
  // Tab Switching
  // ---------------------------------------------------------------------------
  function activateTab(which) {
    var isEnhance = (which === 'enhance');

    tabEnhance.classList.toggle('is-active', isEnhance);
    tabEnhance.setAttribute('aria-selected', String(isEnhance));
    tabEnhance.setAttribute('tabindex', isEnhance ? '0' : '-1');

    tabSettings.classList.toggle('is-active', !isEnhance);
    tabSettings.setAttribute('aria-selected', String(!isEnhance));
    tabSettings.setAttribute('tabindex', isEnhance ? '-1' : '0');

    panelEnhance.classList.toggle('hidden', !isEnhance);
    panelSettings.classList.toggle('hidden', isEnhance);

    if (isEnhance) {
      updateLastResultUI();
    }
  }

  tabEnhance.addEventListener('click', function () { activateTab('enhance'); });
  tabSettings.addEventListener('click', function () { activateTab('settings'); });

  function onTabKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      var currentlyOnEnhance = tabEnhance.classList.contains('is-active');
      if (currentlyOnEnhance) {
        activateTab('settings');
        tabSettings.focus();
      } else {
        activateTab('enhance');
        tabEnhance.focus();
      }
    }
  }

  tabEnhance.addEventListener('keydown', onTabKeyDown);
  tabSettings.addEventListener('keydown', onTabKeyDown);

  // Active model chip opens settings
  activeModelChip.addEventListener('click', function () {
    activateTab('settings');
  });

  // Shortcut change link opens chrome://extensions/shortcuts
  linkShortcuts.addEventListener('click', function (e) {
    e.preventDefault();
    if (chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    }
  });

  // ---------------------------------------------------------------------------
  // Collapsibles (Manual Mode Studio & Advanced Section)
  // ---------------------------------------------------------------------------
  if (manualToggle && manualSection) {
    manualToggle.addEventListener('click', function () {
      var isExpanded = manualToggle.getAttribute('aria-expanded') === 'true';
      manualToggle.setAttribute('aria-expanded', String(!isExpanded));
      manualSection.classList.toggle('hidden', isExpanded);
      panelEnhance.classList.toggle('has-manual-open', !isExpanded);
    });
  }

  if (advancedToggle && advancedSection) {
    advancedToggle.addEventListener('click', function () {
      var isExpanded = advancedToggle.getAttribute('aria-expanded') === 'true';
      advancedToggle.setAttribute('aria-expanded', String(!isExpanded));
      advancedSection.classList.toggle('hidden', isExpanded);
    });
  }

  // ---------------------------------------------------------------------------
  // Masking & Formatting Helpers
  // ---------------------------------------------------------------------------
  function maskKey(key) {
    if (!key || typeof key !== 'string' || key.trim().length < 6) {
      return '';
    }
    var trimmed = key.trim();
    return 'Saved key ending in …' + trimmed.slice(-4);
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) { return ''; }
    var diffMs = Date.now() - timestamp;
    var minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) { return 'just now'; }
    if (minutes < 60) { return minutes + 'm ago'; }
    var hours = Math.floor(minutes / 60);
    if (hours < 24) { return hours + 'h ago'; }
    return Math.floor(hours / 24) + 'd ago';
  }

  function setStatus(el, text, type) {
    if (!el) { return; }
    var baseClass = (el.id === 'site-status') ? 'pe-badge' : 'pe-status-text';
    el.className = baseClass;
    if (type) {
      el.classList.add('status--' + type);
    }
    // Clean any legacy emoji characters
    var cleanText = (text || '').replace(/[✨⚡📋✏️✍️🔒✓✗⚠🙈👁🔄⏳💬]/g, '').trim();
    if (!cleanText) {
      el.innerHTML = '';
      return;
    }
    var iconHtml = '';
    if (type === 'ok') {
      iconHtml = SVG_CHECK;
    } else if (type === 'error') {
      iconHtml = SVG_ERROR;
    } else if (type === 'warn') {
      iconHtml = SVG_WARN;
    }
    el.innerHTML = iconHtml + '<span>' + cleanText + '</span>';
  }

  // ---------------------------------------------------------------------------
  // Form Draft & Dirty Tracking
  // ---------------------------------------------------------------------------
  function getActiveProvider() {
    return selectProvider.value || 'openrouter';
  }

  function updateDraftFromForm() {
    var p = getActiveProvider();
    if (!drafts[p]) { drafts[p] = {}; }
    drafts[p].apiKey = inputApiKey.value;
    drafts[p].model  = inputModel.value;
    if (p === 'custom') {
      drafts[p].baseUrl = inputBaseUrl.value;
    }
    checkDirty();
  }

  function isFormDirty() {
    if (!savedSettings) { return false; }
    var p = getActiveProvider();
    if (p !== savedSettings.provider) { return true; }

    var currentKey = inputApiKey.value.trim();
    var savedKey = (savedSettings.apiKeys[p] || '').trim();
    if (currentKey !== savedKey) { return true; }

    var currentModel = inputModel.value.trim();
    var savedModel = (savedSettings.models[p] || '').trim();
    if (currentModel !== savedModel) { return true; }

    if (p === 'custom') {
      var currentBase = inputBaseUrl.value.trim().replace(/\/+$/, '');
      var savedBase = (savedSettings.customBaseUrl || '').trim().replace(/\/+$/, '');
      if (currentBase !== savedBase) { return true; }
    }

    if (selectStyle.value !== savedSettings.enhancementStyle) { return true; }
    if (checkboxIncludeContext && checkboxIncludeContext.checked !== (savedSettings.includeChatContext !== false)) { return true; }
    if (checkboxMarkdownSymbols && checkboxMarkdownSymbols.checked !== Boolean(savedSettings.useMarkdownFormatting)) { return true; }
    if (checkboxAlwaysIncludeRole && checkboxAlwaysIncludeRole.checked !== Boolean(savedSettings.alwaysIncludeRole)) { return true; }
    if (inputRules.value !== savedSettings.customSystemRules) { return true; }
    if (parseFloat(inputTemperature.value) !== savedSettings.temperature) { return true; }
    if (parseInt(inputMaxTokens.value, 10) !== savedSettings.maxOutputTokens) { return true; }

    return false;
  }

  function checkDirty() {
    var dirty = isFormDirty();
    unsavedIndicator.classList.toggle('hidden', !dirty);
  }

  // ---------------------------------------------------------------------------
  // Provider Switching Logic
  // ---------------------------------------------------------------------------
  function syncProviderUI() {
    var p = getActiveProvider();
    var adapter = PE.providers ? PE.providers.get(p) : { label: p, docsUrl: '#', keyPlaceholder: 'Paste key' };

    // Toggle custom base URL row
    rowBaseUrl.classList.toggle('hidden', p !== 'custom');

    // Populate inputs from draft
    var draft = drafts[p] || { apiKey: '', model: '', baseUrl: '' };
    inputApiKey.value = draft.apiKey;
    inputApiKey.placeholder = adapter.keyPlaceholder || 'Paste your API key here';
    inputModel.value = draft.model;
    if (p === 'custom') {
      inputBaseUrl.value = draft.baseUrl || '';
    }

    // Update docs link
    linkGetKey.href = adapter.docsUrl || '#';
    linkGetKey.innerHTML = '<span>Get ' + adapter.label + ' key</span>' +
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

    // Update saved key hint
    var savedKey = savedSettings && savedSettings.apiKeys ? savedSettings.apiKeys[p] : '';
    savedKeyHint.textContent = savedKey ? maskKey(savedKey) : '';

    // Clear test status & datalist
    testStatus.innerHTML = '';
    testStatus.className = 'pe-status-text pe-test-status';
    testDetails.classList.add('hidden');
    testDetails.querySelector('pre').textContent = '';

    // Populate datalist from cache if available
    populateDatalist(modelsCache[p] || []);

    checkDirty();
  }

  selectProvider.addEventListener('change', function () {
    syncProviderUI();
  });

  // ---------------------------------------------------------------------------
  // Input Listeners (Dirty Tracking & Live Updates)
  // ---------------------------------------------------------------------------
  inputApiKey.addEventListener('input', updateDraftFromForm);
  inputModel.addEventListener('input', updateDraftFromForm);
  inputBaseUrl.addEventListener('input', updateDraftFromForm);
  selectStyle.addEventListener('change', checkDirty);
  if (checkboxIncludeContext) {
    checkboxIncludeContext.addEventListener('change', checkDirty);
  }
  if (checkboxMarkdownSymbols) {
    checkboxMarkdownSymbols.addEventListener('change', checkDirty);
  }
  if (checkboxAlwaysIncludeRole) {
    checkboxAlwaysIncludeRole.addEventListener('change', checkDirty);
  }

  inputRules.addEventListener('input', function () {
    var len = inputRules.value.length;
    rulesCounter.textContent = len + ' / 4000';
    if (len > 4000) {
      rulesCounter.classList.add('status--error');
    } else {
      rulesCounter.classList.remove('status--error');
    }
    checkDirty();
  });

  inputTemperature.addEventListener('input', function () {
    temperatureValue.textContent = inputTemperature.value;
    checkDirty();
  });

  inputMaxTokens.addEventListener('input', checkDirty);

  // Show / hide API key toggle (SVG Eye / Eye-Slash)
  btnToggleKey.addEventListener('click', function () {
    var isPassword = (inputApiKey.type === 'password');
    inputApiKey.type = isPassword ? 'text' : 'password';
    btnToggleKey.innerHTML = isPassword ? SVG_EYE_CLOSED : SVG_EYE_OPEN;
    btnToggleKey.setAttribute('aria-label', isPassword ? 'Hide API key' : 'Show API key');
  });

  // ---------------------------------------------------------------------------
  // Active Model Chip
  // ---------------------------------------------------------------------------
  function updateActiveModelChip() {
    if (!savedSettings) { return; }
    var p = savedSettings.provider;
    var adapter = PE.providers ? PE.providers.get(p) : { label: p };
    var model = savedSettings.models[p];
    var chipLabel = activeModelChip.querySelector('.pe-chip-label');

    if (chipLabel) {
      if (model) {
        chipLabel.textContent = adapter.label + ' · ' + model;
      } else {
        chipLabel.textContent = adapter.label + ' · No model configured';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Load Models List (Animated SVG Spinner)
  // ---------------------------------------------------------------------------
  function populateDatalist(models) {
    datalistModels.innerHTML = '';
    if (!models || models.length === 0) { return; }

    models.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name + (m.free ? ' [Free]' : '');
      datalistModels.appendChild(opt);
    });
  }

  btnLoadModels.addEventListener('click', function () {
    var p = getActiveProvider();
    var apiKey = inputApiKey.value.trim();
    var baseUrl = (p === 'custom') ? inputBaseUrl.value.trim() : '';

    btnLoadModels.disabled = true;
    btnLoadModels.innerHTML = SVG_RELOAD_SPIN;
    modelsStatus.textContent = 'Loading models…';
    modelsStatus.className = 'pe-status-text pe-muted';

    chrome.runtime.sendMessage({
      type: PE.C.MSG.LIST_MODELS,
      payload: {
        provider: p,
        apiKey: apiKey,
        baseUrl: baseUrl
      }
    }, function (res) {
      btnLoadModels.disabled = false;
      btnLoadModels.innerHTML = SVG_RELOAD;

      if (chrome.runtime.lastError) {
        setStatus(modelsStatus, chrome.runtime.lastError.message, 'error');
        return;
      }

      if (res && res.ok && Array.isArray(res.models)) {
        modelsCache[p] = res.models;
        populateDatalist(res.models);
        setStatus(modelsStatus, 'Loaded ' + res.models.length + ' models', 'ok');
        setTimeout(function () {
          if (modelsStatus.textContent.indexOf('Loaded') !== -1) {
            modelsStatus.textContent = '';
          }
        }, 4000);
      } else {
        var errMsg = (res && res.error && res.error.message) ? res.error.message : 'Failed to load models catalog.';
        setStatus(modelsStatus, errMsg, 'warn');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Two-Stage Test Connection (Amber Bolt & Emerald Status)
  // ---------------------------------------------------------------------------
  function ensureHostPermission(url) {
    return new Promise(function (resolve) {
      if (!chrome.permissions || !chrome.permissions.request) {
        return resolve(true);
      }
      try {
        var parsed = new URL(url);
        var originPattern = parsed.origin + '/*';
        chrome.permissions.request({ origins: [originPattern] }, function (granted) {
          resolve(Boolean(granted));
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  btnTest.addEventListener('click', function () {
    var p = getActiveProvider();
    var apiKey = inputApiKey.value.trim();
    var model = inputModel.value.trim();
    var baseUrl = (p === 'custom') ? inputBaseUrl.value.trim() : '';

    // Stage 0: Instant client pre-validation
    if (p !== 'custom' && !apiKey) {
      setStatus(testStatus, 'Please enter an API key to test.', 'error');
      return;
    }
    if (!model) {
      setStatus(testStatus, 'Please enter or select a model name to test.', 'error');
      return;
    }
    if (p === 'custom') {
      if (!baseUrl) {
        setStatus(testStatus, 'Please enter a base URL for custom provider.', 'error');
        return;
      }
      if (baseUrl.indexOf('http://localhost') !== 0 && baseUrl.indexOf('http://127.0.0.1') !== 0 && baseUrl.indexOf('https://') !== 0) {
        setStatus(testStatus, 'Base URL must start with https:// or http://localhost', 'error');
        return;
      }
    }

    // Permission check for Custom origin
    var permPromise = (p === 'custom' && baseUrl.indexOf('https://') === 0)
      ? ensureHostPermission(baseUrl)
      : Promise.resolve(true);

    permPromise.then(function (granted) {
      if (!granted) {
        setStatus(testStatus, 'Permission to access host was denied.', 'error');
        return;
      }

      // Enter testing state
      btnTest.disabled = true;
      btnTest.innerHTML = '<span class="pe-spinner"></span><span>Testing…</span>';
      setStatus(testStatus, 'Testing connection…', 'muted');
      testDetails.classList.add('hidden');
      testDetails.querySelector('pre').textContent = '';

      chrome.runtime.sendMessage({
        type: PE.C.MSG.TEST_CONNECTION,
        payload: {
          provider: p,
          apiKey: apiKey,
          model: model,
          baseUrl: baseUrl
        }
      }, function (res) {
        btnTest.disabled = false;
        btnTest.innerHTML = SVG_BOLT + '<span>Test Connection</span>';

        if (chrome.runtime.lastError) {
          setStatus(testStatus, 'Extension error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (res && res.ok) {
          // Success
          var msg = 'Connected — ' + model + ' responded in ' + res.latencyMs + ' ms';
          if (res.info) {
            msg += ' · ' + res.info;
          }
          setStatus(testStatus, msg, 'ok');
          testDetails.classList.add('hidden');
        } else {
          // Failure: check stage
          var stage = res ? res.stage : 'key';
          var err = (res && res.error) || {};
          var errMsg = err.message || 'Connection failed.';

          if (stage === 'model') {
            setStatus(testStatus, 'Key valid · Model failed — ' + errMsg, 'warn');
          } else {
            setStatus(testStatus, 'API key rejected — ' + errMsg, 'error');
          }

          if (err.detail) {
            testDetails.classList.remove('hidden');
            testDetails.querySelector('pre').textContent = err.detail;
          }
        }
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Save Settings
  // ---------------------------------------------------------------------------
  btnSave.addEventListener('click', function () {
    var p = getActiveProvider();
    var currentBase = (p === 'custom') ? inputBaseUrl.value.trim().replace(/\/+$/, '') : '';

    if (p === 'custom') {
      if (currentBase && currentBase.indexOf('http://localhost') !== 0 && currentBase.indexOf('http://127.0.0.1') !== 0 && currentBase.indexOf('https://') !== 0) {
        setStatus(saveStatus, 'Base URL must start with https:// or http://localhost', 'error');
        return;
      }
    }

    if (inputRules.value.length > 4000) {
      setStatus(saveStatus, 'Custom system rules exceed 4,000 character limit', 'error');
      return;
    }

    // Assemble partial update
    var partial = {
      provider: p,
      apiKeys: {},
      models: {},
      enhancementStyle: selectStyle.value,
      includeChatContext: checkboxIncludeContext ? checkboxIncludeContext.checked : true,
      useMarkdownFormatting: checkboxMarkdownSymbols ? checkboxMarkdownSymbols.checked : false,
      alwaysIncludeRole: checkboxAlwaysIncludeRole ? checkboxAlwaysIncludeRole.checked : false,
      customSystemRules: inputRules.value,
      temperature: parseFloat(inputTemperature.value) || 0.3,
      maxOutputTokens: parseInt(inputMaxTokens.value, 10) || 1500
    };

    partial.apiKeys[p] = inputApiKey.value.trim();
    partial.models[p] = inputModel.value.trim();
    if (p === 'custom') {
      partial.customBaseUrl = currentBase;
    }

    btnSave.disabled = true;
    PE.storage.saveSettings(partial).then(function (updated) {
      btnSave.disabled = false;
      savedSettings = updated;

      // Update in-memory drafts
      drafts[p].apiKey = updated.apiKeys[p];
      drafts[p].model  = updated.models[p];
      if (p === 'custom') {
        drafts[p].baseUrl = updated.customBaseUrl;
      }

      // Update UI hints & badges
      savedKeyHint.textContent = updated.apiKeys[p] ? maskKey(updated.apiKeys[p]) : '';
      updateActiveModelChip();
      checkDirty();

      // Welcome note: hide if key is now configured
      if (updated.apiKeys[p]) {
        welcomeNote.classList.add('hidden');
      }

      if (lastPingResponse) {
        updateEnhanceTabUI(lastPingResponse);
      }

      setStatus(saveStatus, 'Saved', 'ok');
      setTimeout(function () {
        if (saveStatus.textContent.indexOf('Saved') !== -1) {
          saveStatus.textContent = '';
        }
      }, 2500);
    }).catch(function (err) {
      btnSave.disabled = false;
      setStatus(saveStatus, 'Failed to save: ' + (err.message || String(err)), 'error');
    });
  });

  // ---------------------------------------------------------------------------
  // Reset Settings
  // ---------------------------------------------------------------------------
  btnReset.addEventListener('click', function () {
    var confirmed = window.confirm('Reset all settings to factory defaults? Your saved API keys will be cleared.');
    if (!confirmed) { return; }

    btnReset.disabled = true;
    PE.storage.resetSettings().then(function (fresh) {
      btnReset.disabled = false;
      savedSettings = fresh;

      // Reset drafts
      for (var prov in drafts) {
        drafts[prov] = {
          apiKey: fresh.apiKeys[prov] || '',
          model: fresh.models[prov] || '',
          baseUrl: (prov === 'custom' ? fresh.customBaseUrl : '')
        };
      }

      initFormFromSettings(fresh);
      if (lastPingResponse) {
        updateEnhanceTabUI(lastPingResponse);
      }
      setStatus(saveStatus, 'Reset to defaults', 'ok');
      setTimeout(function () { saveStatus.textContent = ''; }, 2500);
    }).catch(function (err) {
      btnReset.disabled = false;
      setStatus(saveStatus, 'Reset failed: ' + (err.message || String(err)), 'error');
    });
  });

  // ---------------------------------------------------------------------------
  // Initialize Form from Settings
  // ---------------------------------------------------------------------------
  function initFormFromSettings(s) {
    savedSettings = s;
    selectProvider.value = s.provider || 'openrouter';

    // Populate drafts
    for (var prov in drafts) {
      drafts[prov].apiKey = (s.apiKeys && s.apiKeys[prov]) || '';
      drafts[prov].model  = (s.models && s.models[prov]) || '';
      if (prov === 'custom') {
        drafts[prov].baseUrl = s.customBaseUrl || '';
      }
    }

    selectStyle.value = s.enhancementStyle || 'balanced';
    if (checkboxIncludeContext) {
      checkboxIncludeContext.checked = (s.includeChatContext !== false);
    }
    if (checkboxMarkdownSymbols) {
      checkboxMarkdownSymbols.checked = Boolean(s.useMarkdownFormatting);
    }
    if (checkboxAlwaysIncludeRole) {
      checkboxAlwaysIncludeRole.checked = Boolean(s.alwaysIncludeRole);
    }
    inputRules.value = s.customSystemRules || '';
    rulesCounter.textContent = (s.customSystemRules || '').length + ' / 4000';
    inputTemperature.value = (typeof s.temperature === 'number') ? s.temperature : 0.3;
    temperatureValue.textContent = inputTemperature.value;
    inputMaxTokens.value = s.maxOutputTokens || 1500;

    syncProviderUI();
    updateActiveModelChip();

    // Last test status
    if (s.lastTest) {
      var lt = s.lastTest;
      var timeStr = formatTimeAgo(lt.at);
      if (lt.ok) {
        var okMsg = 'Connected (' + (lt.latencyMs ? lt.latencyMs + ' ms' : '') + ') · ' + timeStr;
        setStatus(testStatus, okMsg, 'ok');
      } else {
        var failMsg = (lt.stage === 'model' ? 'Key valid · Model failed' : 'Key rejected') + ' · ' + timeStr;
        setStatus(testStatus, failMsg, lt.stage === 'model' ? 'warn' : 'error');
      }
    }

    // Welcome note logic: if no API key for active provider, open on Settings tab with welcome note
    var hasActiveKey = Boolean(s.apiKeys && s.apiKeys[s.provider]);
    if (!hasActiveKey) {
      welcomeNote.classList.remove('hidden');
      activateTab('settings');
    } else {
      welcomeNote.classList.add('hidden');
      activateTab('enhance');
    }

    // Check last result presence
    updateLastResultUI();

    if (lastPingResponse) {
      updateEnhanceTabUI(lastPingResponse);
    }

    checkDirty();
  }

  // ---------------------------------------------------------------------------
  // Enhance Tab: Content Script Pinging & Injection
  // ---------------------------------------------------------------------------
  var activeTabId = null;

  function setButtonDisabled(btn, disabled, title) {
    btn.disabled = Boolean(disabled);
    if (disabled) {
      btn.setAttribute('disabled', '');
      btn.setAttribute('aria-disabled', 'true');
    } else {
      btn.removeAttribute('disabled');
      btn.setAttribute('aria-disabled', 'false');
    }
    btn.title = title || '';
  }

  function getConfigurationStatus() {
    if (!savedSettings) {
      return { ready: false, reason: 'Loading configuration…' };
    }
    var p = savedSettings.provider || 'openrouter';
    var key = (savedSettings.apiKeys && savedSettings.apiKeys[p]) ? savedSettings.apiKeys[p].trim() : '';
    var model = (savedSettings.models && savedSettings.models[p]) ? savedSettings.models[p].trim() : '';
    var baseUrl = (p === 'custom' && savedSettings.customBaseUrl) ? savedSettings.customBaseUrl.trim() : '';

    if (p !== 'custom' && !key) {
      return { ready: false, reason: 'Configure your API key in Settings first.' };
    }
    if (p === 'custom' && !baseUrl) {
      return { ready: false, reason: 'Configure your Base URL in Settings first.' };
    }
    if (!model) {
      return { ready: false, reason: 'Select a model in Settings first.' };
    }
    return { ready: true };
  }

  function updateEnhanceTabUI(res) {
    lastPingResponse = res;
    if (!res || !res.ok) {
      setStatus(siteStatus, "Can't run on this page", 'muted');
      draftStatus.textContent = 'No response from page';
      setButtonDisabled(btnEnhance, true, 'No editable input detected');
      return;
    }

    // Site detected
    var siteName = res.site || 'Page';
    setStatus(siteStatus, siteName + ' detected', 'ok');

    // Chat context detected
    if (contextStatusRow && contextStatus) {
      if (typeof res.contextCount === 'number' && res.contextCount > 0) {
        contextStatusRow.classList.remove('hidden');
        contextStatus.innerHTML = SVG_CHAT + '<span>' + res.contextCount + ' message' + (res.contextCount === 1 ? '' : 's') + ' in chat context</span>';
      } else {
        contextStatusRow.classList.add('hidden');
      }
    }

    var cfg = getConfigurationStatus();

    // Draft length and configuration validation
    if (res.hasTarget) {
      if (res.charCount > 0) {
        draftStatus.textContent = res.charCount + ' chars in box';
        if (!cfg.ready) {
          setButtonDisabled(btnEnhance, true, cfg.reason);
        } else {
          setButtonDisabled(btnEnhance, false, '');
        }
      } else {
        draftStatus.textContent = '0 chars in box (empty)';
        setButtonDisabled(btnEnhance, true, 'Type a draft prompt first.');
      }
    } else {
      draftStatus.textContent = 'No chat box focused';
      setButtonDisabled(btnEnhance, true, 'Click into the chat box first.');
    }
  }

  function pingActiveTab() {
    if (!chrome.tabs || !chrome.tabs.query) {
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || tabs.length === 0) {
        return;
      }

      var tab = tabs[0];
      activeTabId = tab.id;
      var url = tab.url || '';

      // Check if URL is an internal or restricted browser page
      var isRestricted = !url ||
        url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('view-source:') ||
        url.indexOf('chrome.google.com/webstore') !== -1 ||
        url.indexOf('chromewebstore.google.com') !== -1 ||
        (url.startsWith('file://') && !tab.url);

      if (isRestricted) {
        if (contextStatusRow) { contextStatusRow.classList.add('hidden'); }
        setStatus(siteStatus, "Can't run on this page", 'muted');
        draftStatus.textContent = 'Use Manual Mode directly';
        setButtonDisabled(btnEnhance, true, 'Cannot run on browser internal or restricted pages');
        // Auto-expand manual section in 2-column layout
        manualSection.classList.remove('hidden');
        manualToggle.setAttribute('aria-expanded', 'true');
        panelEnhance.classList.add('has-manual-open');
        return;
      }

      // Try sending PING_CONTENT
      chrome.tabs.sendMessage(tab.id, { type: PE.C.MSG.PING_CONTENT }, function (res) {
        var err = chrome.runtime.lastError;
        if (err || !res) {
          // Content script not yet injected: attempt programmatic injection via chrome.scripting
          if (chrome.scripting && chrome.scripting.executeScript) {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: [
                'src/content/content-constants.js',
                'src/content/site-adapters.js',
                'src/content/dom-utils.js',
                'src/content/ui-overlay.js',
                'src/content/content.js'
              ]
            }).then(function () {
              // Re-ping after injection
              chrome.tabs.sendMessage(tab.id, { type: PE.C.MSG.PING_CONTENT }, function (res2) {
                if (chrome.runtime.lastError || !res2) {
                  setStatus(siteStatus, "Can't run on this page", 'muted');
                  draftStatus.textContent = 'Injection failed';
                  setButtonDisabled(btnEnhance, true, 'Content script could not be loaded into this page');
                } else {
                  updateEnhanceTabUI(res2);
                }
              });
            }).catch(function () {
              setStatus(siteStatus, "Can't run on this page", 'muted');
              draftStatus.textContent = 'Scripting unavailable';
              setButtonDisabled(btnEnhance, true, 'Permission denied to script this page');
            });
          } else {
            setStatus(siteStatus, "Can't run on this page", 'muted');
            draftStatus.textContent = 'Scripting unavailable';
            setButtonDisabled(btnEnhance, true, 'Scripting unavailable');
          }
        } else {
          updateEnhanceTabUI(res);
        }
      });
    });
  }

  // Enhance button click handler
  btnEnhance.addEventListener('click', function () {
    if (!activeTabId) {
      return;
    }

    var cfg = getConfigurationStatus();
    if (!cfg.ready) {
      setStatus(draftStatus, cfg.reason, 'warn');
      return;
    }

    setButtonDisabled(btnEnhance, true, '');
    btnEnhance.innerHTML = '<span class="pe-spinner"></span><span>Enhancing in page…</span>';

    chrome.tabs.sendMessage(activeTabId, { type: PE.C.MSG.START_ENHANCE }, function (res) {
      var err = chrome.runtime.lastError;
      if (err || !res || !res.ok) {
        setButtonDisabled(btnEnhance, false, '');
        btnEnhance.innerHTML = SVG_WAND_HERO + '<span class="pe-btn-text">Enhance Prompt</span>';
        var errorMsg = (res && res.error && res.error.message) || (err ? err.message : 'Failed to start enhancement.');
        setStatus(draftStatus, errorMsg, 'error');
        return;
      }

      setStatus(draftStatus, 'Enhancing in page…', 'ok');
      // Auto close popup so focus returns to the page
      var closeDelay = (PE.C.LIMITS && PE.C.LIMITS.POPUP_CLOSE_DELAY_MS) || 600;
      setTimeout(function () {
        window.close();
      }, closeDelay);
    });
  });

  // ---------------------------------------------------------------------------
  // Manual Mode (Fallback enhancement studio inside popup)
  // ---------------------------------------------------------------------------
  btnManualEnhance.addEventListener('click', function () {
    var text = manualInput.value.trim();
    if (!text) {
      setStatus(manualStatus, 'Please enter a draft prompt to enhance.', 'warn');
      return;
    }

    var cfg = getConfigurationStatus();
    if (!cfg.ready) {
      setStatus(manualStatus, cfg.reason, 'warn');
      return;
    }

    btnManualEnhance.disabled = true;
    btnManualEnhance.innerHTML = '<span class="pe-spinner"></span><span>Enhancing…</span>';
    setStatus(manualStatus, 'Enhancing prompt…', 'muted');
    btnManualCopy.disabled = true;

    chrome.runtime.sendMessage({
      type: PE.C.MSG.ENHANCE_PROMPT,
      text: text,
      source: 'manual'
    }, function (res) {
      btnManualEnhance.disabled = false;
      btnManualEnhance.innerHTML = SVG_WAND_SM + '<span>Enhance</span>';

      if (chrome.runtime.lastError) {
        setStatus(manualStatus, 'Error: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      if (res && res.ok && res.enhancedText) {
        manualOutput.value = res.enhancedText;
        btnManualCopy.disabled = false;
        setStatus(manualStatus, 'Enhanced successfully', 'ok');
        updateLastResultUI();
      } else {
        var err = (res && res.error) || {};
        var msg = err.message || 'Enhancement failed.';
        setStatus(manualStatus, msg, 'error');
      }
    });
  });

  if (btnManualGrammar) {
    btnManualGrammar.addEventListener('click', function () {
      var text = manualInput.value.trim();
      if (!text) {
        setStatus(manualStatus, 'Please enter text to correct.', 'warn');
        return;
      }

      var cfg = getConfigurationStatus();
      if (!cfg.ready) {
        setStatus(manualStatus, cfg.reason, 'warn');
        return;
      }

      btnManualGrammar.disabled = true;
      btnManualGrammar.innerHTML = '<span class="pe-spinner"></span><span>Correcting…</span>';
      setStatus(manualStatus, 'Correcting grammar…', 'muted');
      btnManualCopy.disabled = true;

      chrome.runtime.sendMessage({
        type: PE.C.MSG.CORRECT_GRAMMAR,
        text: text,
        source: 'manual'
      }, function (res) {
        btnManualGrammar.disabled = false;
        btnManualGrammar.innerHTML = SVG_PEN_ROSE + '<span>Correct Grammar</span>';

        if (chrome.runtime.lastError) {
          setStatus(manualStatus, 'Error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (res && res.ok && res.correctedText) {
          manualOutput.value = res.correctedText;
          btnManualCopy.disabled = false;
          setStatus(manualStatus, 'Grammar corrected', 'ok');
          updateLastResultUI();
        } else {
          var err = (res && res.error) || {};
          var msg = err.message || 'Grammar correction failed.';
          setStatus(manualStatus, msg, 'error');
        }
      });
    });
  }

  btnManualCopy.addEventListener('click', function () {
    if (!manualOutput.value) { return; }
    navigator.clipboard.writeText(manualOutput.value).then(function () {
      btnManualCopy.innerHTML = SVG_CHECK + '<span>Copied</span>';
      setTimeout(function () {
        btnManualCopy.innerHTML = SVG_COPY_CYAN_SM + '<span>Copy</span>';
      }, 2000);
    });
  });

  // ---------------------------------------------------------------------------
  // Copy Last Result
  // ---------------------------------------------------------------------------
  var cachedLastResult = '';

  function updateLastResultUI() {
    function applyResult(last) {
      var row = document.querySelector('.pe-last-result-row');
      if (last && typeof last.enhancedText === 'string' && last.enhancedText.trim()) {
        cachedLastResult = last.enhancedText;
        if (row) {
          row.classList.remove('hidden');
        }
      } else {
        cachedLastResult = '';
        if (row) {
          row.classList.add('hidden');
        }
      }
    }

    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: PE.C.MSG.GET_LAST_RESULT }, function (res) {
        if (!chrome.runtime.lastError && res && res.ok && res.lastResult) {
          applyResult(res.lastResult);
        } else if (PE.storage && PE.storage.getLastResult) {
          PE.storage.getLastResult().then(applyResult).catch(function () {});
        } else {
          applyResult(null);
        }
      });
    } else if (PE.storage && PE.storage.getLastResult) {
      PE.storage.getLastResult().then(applyResult).catch(function () {});
    }
  }

  if (btnCopyLast) {
    btnCopyLast.addEventListener('click', function () {
      if (!cachedLastResult) { return; }
      navigator.clipboard.writeText(cachedLastResult).then(function () {
        btnCopyLast.innerHTML = SVG_CHECK + '<span>Copied</span>';
        setTimeout(function () {
          btnCopyLast.innerHTML = SVG_COPY_CYAN_MD + '<span>Copy last result</span>';
        }, 2000);
      });
    });
  }

  // Load configured keyboard shortcuts
  function updateShortcutHint() {
    if (chrome.commands && chrome.commands.getAll) {
      chrome.commands.getAll(function (commands) {
        if (commands) {
          var enhanceKey = 'Alt+Shift+E';
          var grammarKey = 'Alt+Shift+G';
          for (var i = 0; i < commands.length; i++) {
            if (commands[i].name === 'enhance-prompt' && commands[i].shortcut) {
              enhanceKey = commands[i].shortcut;
            } else if (commands[i].name === 'correct-grammar' && commands[i].shortcut) {
              grammarKey = commands[i].shortcut;
            }
          }
          shortcutHint.innerHTML = '<span class="pe-shortcut-item">Enhance <kbd>' + enhanceKey + '</kbd></span>' +
            '<span class="pe-shortcut-dot">•</span>' +
            '<span class="pe-shortcut-item">Grammar <kbd>' + grammarKey + '</kbd></span>';
        }
      });
    }
  }

  if (linkShortcuts) {
    linkShortcuts.addEventListener('click', function (e) {
      e.preventDefault();
      var isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
      var shortcutsUrl = isFirefox ? 'about:addons' : 'chrome://extensions/shortcuts';
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: shortcutsUrl });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Startup
  // ---------------------------------------------------------------------------
  function init() {
    // Version display
    try {
      var manifest = chrome.runtime.getManifest();
      footerVersion.textContent = manifest.version || '1.0.0';
    } catch (e) {
      footerVersion.textContent = '1.0.0';
    }

    // Ping active tab for site/draft status
    pingActiveTab();
    updateShortcutHint();
    updateLastResultUI();

    // Load stored settings
    PE.storage.getSettings().then(function (s) {
      initFormFromSettings(s);
    }).catch(function (err) {
      console.error('[PE] Failed to load settings:', err);
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
