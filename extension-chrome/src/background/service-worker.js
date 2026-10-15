// service-worker.js — Prompt Enhancer Background Service Worker (Phase 4)
// Manifest V3 service worker entry point (classic non-module script).
// Uses importScripts() with paths relative to extension root.
// All chrome.* event listeners are registered synchronously at the top level.

'use strict';

/* global importScripts, chrome, globalThis */

// ---------------------------------------------------------------------------
// 1. Synchronous module imports (exact order per Section 3.1 of PLAN.md)
// ---------------------------------------------------------------------------
if (typeof importScripts === 'function') {
  importScripts(
    '/src/shared/namespace.js',
    '/src/shared/constants.js',
    '/src/shared/errors.js',
    '/src/shared/storage.js',
    '/src/background/http.js',
    '/src/background/providers/openai-compatible.js',
    '/src/background/providers/openrouter.js',
    '/src/background/providers/opencode.js',
    '/src/background/providers/custom.js',
    '/src/background/providers/registry.js',
    '/src/background/enhancer.js'
  );
}

var PE = globalThis.PE;

// ---------------------------------------------------------------------------
// 2. Lifecycle — onInstalled
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(function (details) {
  if (PE.C.DEBUG) {
    console.log('[PE] Extension installed/updated. Reason:', details.reason);
  }
  if (details.reason === 'install') {
    // Populate default settings on fresh install
    PE.storage.getSettings().then(function (settings) {
      if (PE.C.DEBUG) {
        console.log('[PE] Fresh install initialized. Provider:', settings.provider);
      }
    }).catch(function (err) {
      console.error('[PE] Failed to initialize default settings:', err);
    });
  }

  // Create editable context menu items (Section 5.3 & Phase 5)
  if (chrome.contextMenus && chrome.contextMenus.create) {
    chrome.contextMenus.create({
      id: 'pe-enhance',
      title: 'Enhance Prompt (Alt+Shift+E)',
      contexts: ['editable']
    }, function () {
      if (chrome.runtime.lastError) {}
    });

    chrome.contextMenus.create({
      id: 'pe-correct-grammar',
      title: 'Correct Grammar (Alt+Shift+G)',
      contexts: ['editable']
    }, function () {
      if (chrome.runtime.lastError) {}
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Message Handlers
// ---------------------------------------------------------------------------

/**
 * Handle TEST_CONNECTION message.
 * Two-stage validation:
 *   Stage 1 (Key): adapter.verifyKey()
 *   Stage 2 (Model): adapter.complete() with a ping prompt
 *
 * @param {Object} payload { provider, apiKey, model, baseUrl }
 * @returns {Promise<Object>}
 */
function handleTestConnection(payload) {
  var providerId = (payload && payload.provider) || 'openrouter';
  var apiKey     = (payload && payload.apiKey) || '';
  var model      = (payload && payload.model) || '';
  var baseUrl    = (payload && payload.baseUrl) || '';

  var adapter = PE.providers.get(providerId);
  var startTime = Date.now();
  var keyCheckInfo = '';

  // Stage 1: Key Check
  return adapter.verifyKey({ apiKey: apiKey, baseUrl: baseUrl })
    .then(function (keyResult) {
      keyCheckInfo = (keyResult && keyResult.info) || 'Key valid';

      // Stage 2: Model Ping
      var pingMessages = [
        { role: 'user', content: 'Reply with the single word: pong' }
      ];

      return adapter.complete({
        apiKey: apiKey,
        baseUrl: baseUrl,
        model: model,
        messages: pingMessages,
        temperature: 0,
        maxTokens: 50,
        timeoutMs: (PE.C && PE.C.LIMITS && PE.C.LIMITS.TIMEOUT_PING_MODEL_MS) || 20000
      });
    })
    .then(function (completeResult) {
      var latencyMs = Date.now() - startTime;
      var rawSample = (completeResult && completeResult.text) ? completeResult.text.trim() : '';
      var sample = rawSample.slice(0, 40);

      var responseData = {
        ok: true,
        keyValid: true,
        modelValid: true,
        latencyMs: latencyMs,
        sample: sample,
        info: keyCheckInfo
      };

      // Persist success to lastTest in settings
      PE.storage.saveSettings({
        lastTest: {
          provider: providerId,
          model: model,
          ok: true,
          at: Date.now(),
          latencyMs: latencyMs,
          message: 'Connected (' + latencyMs + ' ms)'
        }
      }).catch(function (e) {
        if (PE.C.DEBUG) { console.warn('[PE] Failed to save lastTest success:', e); }
      });

      return responseData;
    })
    .catch(function (err) {
      var stage = err && err.stage ? err.stage : (keyCheckInfo ? 'model' : 'key');
      var errorObj = PE.errors.isPEError(err) ? err : PE.errors.make(PE.errors.CODES.UNKNOWN, err, stage, adapter.label, model);
      errorObj.stage = stage;

      // Persist failure to lastTest in settings
      PE.storage.saveSettings({
        lastTest: {
          provider: providerId,
          model: model,
          ok: false,
          at: Date.now(),
          stage: stage,
          message: errorObj.message || 'Connection failed'
        }
      }).catch(function (e) {
        if (PE.C.DEBUG) { console.warn('[PE] Failed to save lastTest error:', e); }
      });

      return {
        ok: false,
        error: errorObj,
        stage: stage
      };
    });
}

/**
 * Handle LIST_MODELS message.
 *
 * @param {Object} payload { provider, apiKey, baseUrl }
 * @returns {Promise<Object>}
 */
function handleListModels(payload) {
  var providerId = (payload && payload.provider) || 'openrouter';
  var apiKey     = (payload && payload.apiKey) || '';
  var baseUrl    = (payload && payload.baseUrl) || '';

  var adapter = PE.providers.get(providerId);

  return adapter.listModels({ apiKey: apiKey, baseUrl: baseUrl })
    .then(function (models) {
      return {
        ok: true,
        models: models || []
      };
    })
    .catch(function (err) {
      var errorObj = PE.errors.isPEError(err) ? err : PE.errors.make(PE.errors.CODES.UNKNOWN, err, null, adapter.label);
      return {
        ok: false,
        error: errorObj
      };
    });
}

/**
 * Handle GET_LAST_RESULT message.
 *
 * @returns {Promise<Object>}
 */
function handleGetLastResult() {
  return PE.storage.getLastResult().then(function (lastResult) {
    return {
      ok: true,
      lastResult: lastResult
    };
  });
}

/**
 * Handle ENHANCE_PROMPT message (Section 11 Phase 4).
 *
 * @param {Object} payload { text, source }
 * @param {Object} sender chrome.runtime.MessageSender
 * @returns {Promise<Object>}
 */
function handleEnhancePrompt(payload, sender) {
  var rawText = (payload && typeof payload.text === 'string') ? payload.text.trim() : '';
  var rawContext = (payload && payload.context) || null;
  var effectiveContext = null;
  var maxChars = (PE.C && PE.C.LIMITS && PE.C.LIMITS.MAX_INPUT_CHARS) || 12000;

  if (!rawText) {
    return Promise.reject(PE.errors.make(PE.errors.CODES.INPUT_EMPTY, 'Draft prompt cannot be empty.'));
  }
  if (rawText.length > maxChars) {
    return Promise.reject(PE.errors.make(PE.errors.CODES.INPUT_TOO_LONG, 'Draft prompt exceeds maximum ' + maxChars + ' character limit.'));
  }

  var startTime = Date.now();

  return PE.storage.getSettings().then(function (settings) {
    var providerId = (settings && settings.provider) || 'openrouter';
    var adapter = PE.providers.get(providerId);
    var apiKey = (settings.apiKeys && settings.apiKeys[providerId]) || '';
    var model = (settings.models && settings.models[providerId]) || '';
    var baseUrl = settings.customBaseUrl || '';

    // Credential & configuration checks
    if (providerId !== 'custom' && (!apiKey || !apiKey.trim())) {
      throw PE.errors.make(PE.errors.CODES.NO_KEY, 'Open the Prompt Enhancer popup → Settings to add your API key.', 'key', adapter.label);
    }
    if (providerId === 'custom' && (!baseUrl || !baseUrl.trim())) {
      throw PE.errors.make(PE.errors.CODES.NO_BASE_URL, 'Please configure a Base URL in Settings for the Custom provider.', 'key', adapter.label);
    }
    if (!model || !model.trim()) {
      throw PE.errors.make(PE.errors.CODES.NO_MODEL, 'Please select or enter a model in Settings.', 'model', adapter.label);
    }

    // Custom provider runtime permission verification
    var permCheck = Promise.resolve(true);
    if (providerId === 'custom' && chrome.permissions && chrome.permissions.contains) {
      try {
        var originPattern = new URL(baseUrl).origin + '/*';
        permCheck = chrome.permissions.contains({ origins: [originPattern] }).then(function (hasPerm) {
          if (!hasPerm) {
            throw PE.errors.make(PE.errors.CODES.PERMISSION_DENIED, 'Re-save settings to grant access to your custom endpoint.');
          }
          return true;
        });
      } catch (urlErr) {
        permCheck = Promise.reject(PE.errors.make(PE.errors.CODES.NO_BASE_URL, 'Invalid Custom Base URL format.'));
      }
    }

    return permCheck.then(function () {
      effectiveContext = (settings && settings.includeChatContext === false) ? null : rawContext;
      var messages = PE.enhancer.buildMessages(rawText, settings, effectiveContext);
      var timeoutMs = (PE.C && PE.C.LIMITS && PE.C.LIMITS.TIMEOUT_ENHANCE_MS) || 60000;

      function executeComplete() {
        return adapter.complete({
          apiKey: apiKey,
          baseUrl: baseUrl,
          model: model,
          messages: messages,
          temperature: (typeof settings.temperature === 'number') ? settings.temperature : 0.3,
          maxTokens: settings.maxOutputTokens || 1500,
          timeoutMs: timeoutMs
        });
      }

      // Retry policy per Section 6.3: 1 auto-retry after 1.5s for NETWORK and 5xx errors on enhancement
      return executeComplete().catch(function (err) {
        var isRetryable = err && (err.code === PE.errors.CODES.NETWORK_ERROR || err.code === PE.errors.CODES.SERVER_ERROR);
        if (isRetryable) {
          var retryDelay = (PE.C && PE.C.LIMITS && PE.C.LIMITS.RETRY_DELAY_MS) || 1500;
          return new Promise(function (resolve) {
            setTimeout(resolve, retryDelay);
          }).then(function () {
            return executeComplete();
          });
        }
        throw err;
      });
    }).then(function (result) {
      var enhancedText = PE.enhancer.cleanOutput(result.text, settings);
      var durationMs = Date.now() - startTime;
      var tabUrl = (sender && sender.tab && sender.tab.url) ? sender.tab.url : (sender && sender.url ? sender.url : '');
      var contextUsed = Boolean(effectiveContext && (Array.isArray(effectiveContext) ? effectiveContext.length > 0 : (typeof effectiveContext === 'string' && effectiveContext.trim().length > 0)));

      // Store in transient runtime state (10 minute expiry handled by storage.js)
      PE.storage.setLastResult({
        enhancedText: enhancedText,
        at: Date.now(),
        tabUrl: tabUrl
      }).catch(function (e) {
        if (PE.C.DEBUG) { console.warn('[PE] Failed to save lastResult:', e); }
      });

      return {
        ok: true,
        enhancedText: enhancedText,
        model: result.model || model,
        provider: providerId,
        durationMs: durationMs,
        contextUsed: contextUsed
      };
    });
  });
}

/**
 * Handle CORRECT_GRAMMAR message.
 *
 * @param {Object} payload { text, source }
 * @param {Object} sender chrome.runtime.MessageSender
 * @returns {Promise<Object>}
 */
function handleCorrectGrammar(payload, sender) {
  var rawText = (payload && typeof payload.text === 'string') ? payload.text.trim() : '';
  var maxChars = (PE.C && PE.C.LIMITS && PE.C.LIMITS.MAX_INPUT_CHARS) || 12000;

  if (!rawText) {
    return Promise.reject(PE.errors.make(PE.errors.CODES.INPUT_EMPTY, 'Text cannot be empty.'));
  }
  if (rawText.length > maxChars) {
    return Promise.reject(PE.errors.make(PE.errors.CODES.INPUT_TOO_LONG, 'Text exceeds maximum ' + maxChars + ' character limit.'));
  }

  var startTime = Date.now();

  return PE.storage.getSettings().then(function (settings) {
    var providerId = (settings && settings.provider) || 'openrouter';
    var adapter = PE.providers.get(providerId);
    var apiKey = (settings.apiKeys && settings.apiKeys[providerId]) || '';
    var model = (settings.models && settings.models[providerId]) || '';
    var baseUrl = settings.customBaseUrl || '';

    // Credential & configuration checks
    if (providerId !== 'custom' && (!apiKey || !apiKey.trim())) {
      throw PE.errors.make(PE.errors.CODES.NO_KEY, 'Open the Prompt Enhancer popup → Settings to add your API key.', 'key', adapter.label);
    }
    if (providerId === 'custom' && (!baseUrl || !baseUrl.trim())) {
      throw PE.errors.make(PE.errors.CODES.NO_BASE_URL, 'Please configure a Base URL in Settings for the Custom provider.', 'key', adapter.label);
    }
    if (!model || !model.trim()) {
      throw PE.errors.make(PE.errors.CODES.NO_MODEL, 'Please select or enter a model in Settings.', 'model', adapter.label);
    }

    // Custom provider runtime permission verification
    var permCheck = Promise.resolve(true);
    if (providerId === 'custom' && chrome.permissions && chrome.permissions.contains) {
      try {
        var originPattern = new URL(baseUrl).origin + '/*';
        permCheck = chrome.permissions.contains({ origins: [originPattern] }).then(function (hasPerm) {
          if (!hasPerm) {
            throw PE.errors.make(PE.errors.CODES.PERMISSION_DENIED, 'Re-save settings to grant access to your custom endpoint.');
          }
          return true;
        });
      } catch (urlErr) {
        permCheck = Promise.reject(PE.errors.make(PE.errors.CODES.NO_BASE_URL, 'Invalid Custom Base URL format.'));
      }
    }

    return permCheck.then(function () {
      var messages = PE.enhancer.buildGrammarMessages(rawText);
      var timeoutMs = (PE.C && PE.C.LIMITS && PE.C.LIMITS.TIMEOUT_ENHANCE_MS) || 60000;

      function executeComplete() {
        return adapter.complete({
          apiKey: apiKey,
          baseUrl: baseUrl,
          model: model,
          messages: messages,
          temperature: 0.1,
          maxTokens: settings.maxOutputTokens || 1500,
          timeoutMs: timeoutMs
        });
      }

      return executeComplete().catch(function (err) {
        var isRetryable = err && (err.code === PE.errors.CODES.NETWORK_ERROR || err.code === PE.errors.CODES.SERVER_ERROR);
        if (isRetryable) {
          var retryDelay = (PE.C && PE.C.LIMITS && PE.C.LIMITS.RETRY_DELAY_MS) || 1500;
          return new Promise(function (resolve) {
            setTimeout(resolve, retryDelay);
          }).then(function () {
            return executeComplete();
          });
        }
        throw err;
      });
    }).then(function (result) {
      var correctedText = PE.enhancer.cleanGrammarOutput(result.text);
      var durationMs = Date.now() - startTime;
      var tabUrl = (sender && sender.tab && sender.tab.url) ? sender.tab.url : (sender && sender.url ? sender.url : '');

      PE.storage.setLastResult({
        enhancedText: correctedText,
        at: Date.now(),
        tabUrl: tabUrl
      }).catch(function (e) {
        if (PE.C.DEBUG) { console.warn('[PE] Failed to save lastResult:', e); }
      });

      return {
        ok: true,
        correctedText: correctedText,
        model: result.model || model,
        provider: providerId,
        durationMs: durationMs
      };
    });
  });
}

/**
 * Handle ENHANCE_STATUS message from content script.
 * Updates action badge text and background color per tab.
 *
 * @param {Object} payload { state }
 * @param {Object} sender chrome.runtime.MessageSender
 */
function handleEnhanceStatus(payload, sender) {
  var tabId = sender && sender.tab && sender.tab.id;
  if (!tabId || !chrome.action) {
    return;
  }

  var state = payload && payload.state;
  var successClearMs = (PE.C && PE.C.LIMITS && PE.C.LIMITS.BADGE_SUCCESS_CLEAR_MS) || 3000;
  var errorClearMs   = (PE.C && PE.C.LIMITS && PE.C.LIMITS.BADGE_ERROR_CLEAR_MS) || 5000;

  try {
    if (state === 'busy') {
      chrome.action.setBadgeText({ tabId: tabId, text: '…' });
      chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#6366f1' });
    } else if (state === 'done') {
      chrome.action.setBadgeText({ tabId: tabId, text: '✓' });
      chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#10b981' });
      setTimeout(function () {
        try {
          chrome.action.setBadgeText({ tabId: tabId, text: '' });
        } catch (e) {}
      }, successClearMs);
    } else if (state === 'error') {
      chrome.action.setBadgeText({ tabId: tabId, text: '!' });
      chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#ef4444' });
      setTimeout(function () {
        try {
          chrome.action.setBadgeText({ tabId: tabId, text: '' });
        } catch (e) {}
      }, errorClearMs);
    }
  } catch (e) {
    if (PE.C.DEBUG) { console.warn('[PE] Badge update error:', e); }
  }
}

// ---------------------------------------------------------------------------
// 4. Main Service Worker Message Router
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // Validate that sender is this extension
  if (sender.id !== chrome.runtime.id) {
    sendResponse({
      ok: false,
      error: PE.errors.make(PE.errors.CODES.PERMISSION_DENIED, 'Untrusted message sender.')
    });
    return false;
  }

  var type = message && message.type;
  var payload = message && (message.payload || message);

  // Security check: TEST_CONNECTION and LIST_MODELS must originate from an extension page (popup), not a content script
  var isContentScript = Boolean(sender.tab);
  if (isContentScript && (type === PE.C.MSG.TEST_CONNECTION || type === PE.C.MSG.LIST_MODELS)) {
    sendResponse({
      ok: false,
      error: PE.errors.make(PE.errors.CODES.PERMISSION_DENIED, 'Sensitive settings operations cannot be invoked from content scripts.')
    });
    return false;
  }

  // Route messages
  switch (type) {
    case PE.C.MSG.TEST_CONNECTION:
      handleTestConnection(payload)
        .then(function (res) { sendResponse(res); })
        .catch(function (err) {
          sendResponse({
            ok: false,
            error: PE.errors.isPEError(err) ? err : PE.errors.make(PE.errors.CODES.UNKNOWN, err)
          });
        });
      return true; // Keep channel open for async response

    case PE.C.MSG.LIST_MODELS:
      handleListModels(payload)
        .then(function (res) { sendResponse(res); })
        .catch(function (err) {
          sendResponse({
            ok: false,
            error: PE.errors.isPEError(err) ? err : PE.errors.make(PE.errors.CODES.UNKNOWN, err)
          });
        });
      return true;

    case PE.C.MSG.GET_LAST_RESULT:
      handleGetLastResult()
        .then(function (res) { sendResponse(res); })
        .catch(function (err) {
          sendResponse({
            ok: false,
            error: PE.errors.isPEError(err) ? err : PE.errors.make(PE.errors.CODES.UNKNOWN, err)
          });
        });
      return true;

    case PE.C.MSG.ENHANCE_PROMPT:
      handleEnhancePrompt(payload, sender)
        .then(function (res) { sendResponse(res); })
        .catch(function (err) {
          var errorObj = PE.errors.isPEError(err) ? err : PE.errors.make(PE.errors.CODES.UNKNOWN, err);
          sendResponse({
            ok: false,
            error: errorObj
          });
        });
      return true;

    case PE.C.MSG.CORRECT_GRAMMAR:
      handleCorrectGrammar(payload, sender)
        .then(function (res) { sendResponse(res); })
        .catch(function (err) {
          var errorObj = PE.errors.isPEError(err) ? err : PE.errors.make(PE.errors.CODES.UNKNOWN, err);
          sendResponse({
            ok: false,
            error: errorObj
          });
        });
      return true;

    case PE.C.MSG.ENHANCE_STATUS:
      handleEnhanceStatus(payload, sender);
      return false; // Fire-and-forget notification

    default:
      sendResponse({
        ok: false,
        error: PE.errors.make(PE.errors.CODES.NOT_IMPLEMENTED, 'Handler for "' + type + '" is not yet implemented.')
      });
      return false;
  }
});

// ---------------------------------------------------------------------------
// 5. Shared Trigger Flow (Keyboard Command & Context Menu — Section 5.3)
// ---------------------------------------------------------------------------

var CONTENT_SCRIPT_FILES = [
  'src/content/content-constants.js',
  'src/content/site-adapters.js',
  'src/content/dom-utils.js',
  'src/content/ui-overlay.js',
  'src/content/content.js'
];

/**
 * Trigger prompt enhancement or grammar correction in the target tab.
 * If the content script is not yet injected, injects via chrome.scripting.executeScript and retries once.
 *
 * @param {Object} tab chrome.tabs.Tab
 * @param {string} [action] 'enhance' (default) or 'grammar'
 */
function triggerActionInTab(tab, action) {
  if (!tab || !tab.id) {
    return;
  }

  var actionType = (action === 'grammar')
    ? PE.C.MSG.START_CORRECT_GRAMMAR
    : PE.C.MSG.START_ENHANCE;

  var url = tab.url || '';
  var isRestricted = !url ||
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:') ||
    url.indexOf('chrome.google.com/webstore') !== -1 ||
    url.indexOf('chromewebstore.google.com') !== -1;

  if (isRestricted) {
    if (PE.C.DEBUG) {
      console.warn('[PE] Cannot trigger action on restricted URL:', url);
    }
    return;
  }

  function dispatchStart(isRetry) {
    chrome.tabs.sendMessage(tab.id, {
      type: actionType,
      source: 'command'
    }, function (response) {
      var err = chrome.runtime.lastError;
      if (err) {
        if (!isRetry && chrome.scripting && chrome.scripting.executeScript) {
          // Attempt programmatic injection and retry once
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: CONTENT_SCRIPT_FILES
          }).then(function () {
            dispatchStart(true);
          }).catch(function (injectErr) {
            if (PE.C.DEBUG) {
              console.warn('[PE] Script injection failed for tab ' + tab.id + ':', injectErr);
            }
          });
          return;
        }
        if (PE.C.DEBUG) {
          console.warn('[PE] ' + actionType + ' delivery failed for tab ' + tab.id + ':', err);
        }
        return;
      }

      if (response && !response.ok && PE.C.DEBUG) {
        console.warn('[PE] ' + actionType + ' rejected:', response.error);
      }
    });
  }

  dispatchStart(false);
}

function triggerEnhanceInTab(tab) {
  return triggerActionInTab(tab, 'enhance');
}

// ---------------------------------------------------------------------------
// 6. Top-Level Synchronous Event Listeners (Commands & Context Menus)
// ---------------------------------------------------------------------------

// Context Menu click handler
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(function (info, tab) {
    var action = (info && info.menuItemId === 'pe-correct-grammar') ? 'grammar' : 'enhance';
    if (tab && tab.id) {
      triggerActionInTab(tab, action);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0]) {
          triggerActionInTab(tabs[0], action);
        }
      });
    }
  });
}

// Keyboard shortcut command handler (Alt+Shift+E for enhance, Alt+Shift+G for grammar)
if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(function (command, tab) {
    var action = (command === 'correct-grammar') ? 'grammar' : 'enhance';
    if (tab && tab.id) {
      triggerActionInTab(tab, action);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0]) {
          triggerActionInTab(tabs[0], action);
        }
      });
    }
  });
}
