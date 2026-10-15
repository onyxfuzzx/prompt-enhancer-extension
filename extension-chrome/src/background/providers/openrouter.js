// openrouter.js — Prompt Enhancer
// OpenRouter provider adapter.
// Loaded in service worker context.
// Must be loaded after openai-compatible.js.

/* global globalThis */

(function () {
  'use strict';

  var PE = globalThis.PE = globalThis.PE || {};
  PE.providers = PE.providers || {};

  var ID = 'openrouter';
  var LABEL = 'OpenRouter';
  var BASE_URL = 'https://openrouter.ai/api/v1';
  var KEY_PLACEHOLDER = 'sk-or-v1-…';
  var DOCS_URL = 'https://openrouter.ai/keys';

  /**
   * Return the resolved base URL.
   * @returns {string}
   */
  function resolveBaseUrl() {
    return BASE_URL;
  }

  /**
   * Build request headers for OpenRouter.
   * @param {string} apiKey
   * @returns {Object}
   */
  function buildHeaders(apiKey) {
    var headers = {
      'HTTP-Referer': 'https://github.com/prompt-enhancer/prompt-enhancer',
      'X-Title': 'Prompt Enhancer'
    };
    if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
      headers.Authorization = 'Bearer ' + apiKey.trim();
    }
    return headers;
  }

  /**
   * Stage 1: Verify API key against OpenRouter.
   * Calls GET /key (or fallback GET /auth/key).
   *
   * @param {Object} params { apiKey, baseUrl }
   * @returns {Promise<{ valid: boolean, info: string }>}
   */
  function verifyKey(params) {
    var key = params && params.apiKey;
    if (!key || typeof key !== 'string' || !key.trim()) {
      return Promise.reject(PE.errors.make(PE.errors.CODES.NO_KEY, null, 'key', LABEL));
    }

    var base = (params && params.baseUrl) ? params.baseUrl.replace(/\/+$/, '') : BASE_URL;
    var headers = buildHeaders(key);
    var timeout = (PE.C && PE.C.LIMITS && PE.C.LIMITS.TIMEOUT_TEST_MS) || 15000;

    // Primary: GET /key
    return PE.http.requestJson(base + '/key', { method: 'GET', headers: headers }, timeout, LABEL)
      .then(function (res) {
        var info = 'Key valid';
        if (res && res.data) {
          var d = res.data;
          var parts = [];
          if (d.label) { parts.push(d.label); }
          if (d.usage !== undefined && d.limit !== undefined) {
            parts.push('Usage: $' + Number(d.usage).toFixed(2) + (d.limit ? ' / $' + Number(d.limit).toFixed(2) : ''));
          } else if (d.limit_remaining !== undefined) {
            parts.push('Remaining: $' + Number(d.limit_remaining).toFixed(2));
          }
          if (d.is_free_tier) { parts.push('Free Tier'); }
          if (parts.length > 0) {
            info = parts.join(' · ');
          }
        }
        return { valid: true, info: info };
      })
      .catch(function (err) {
        // If 404, try secondary endpoint: GET /auth/key
        if (err && err.code === PE.errors.CODES.MODEL_NOT_FOUND) {
          return PE.http.requestJson(base + '/auth/key', { method: 'GET', headers: headers }, timeout, LABEL)
            .then(function (res) {
              return { valid: true, info: 'Key verified via /auth/key' };
            })
            .catch(function (secondErr) {
              // If still 404, fall back to testing GET /models with the key as a weaker signal
              if (secondErr && secondErr.code === PE.errors.CODES.MODEL_NOT_FOUND) {
                return listModels({ apiKey: key, baseUrl: base })
                  .then(function () {
                    return { valid: true, info: 'Key verified via /models' };
                  });
              }
              secondErr.stage = 'key';
              throw secondErr;
            });
        }
        err.stage = 'key';
        throw err;
      });
  }

  /**
   * Check if an OpenRouter model is free.
   * @param {Object} m
   * @returns {boolean}
   */
  function isModelFree(m) {
    if (!m) { return false; }
    if (typeof m.id === 'string' && m.id.slice(-5) === ':free') {
      return true;
    }
    if (m.pricing) {
      var pPrompt = String(m.pricing.prompt);
      var pComp = String(m.pricing.completion);
      if ((pPrompt === '0' || pPrompt === '0.0') && (pComp === '0' || pComp === '0.0')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Fetch and return normalized model list from OpenRouter.
   * Sorts free models first, then alphabetical.
   *
   * @param {Object} [params] { apiKey, baseUrl }
   * @returns {Promise<Array<{ id: string, name: string, contextLength?: number, free?: boolean }>>}
   */
  function listModels(params) {
    var base = (params && params.baseUrl) ? params.baseUrl.replace(/\/+$/, '') : BASE_URL;
    var headers = buildHeaders(params && params.apiKey);
    var timeout = (PE.C && PE.C.LIMITS && PE.C.LIMITS.TIMEOUT_TEST_MS) || 15000;

    return PE.http.requestJson(base + '/models', { method: 'GET', headers: headers }, timeout, LABEL)
      .then(function (res) {
        var rawList = (res && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);
        var normalized = [];

        for (var i = 0; i < rawList.length; i++) {
          var item = rawList[i];
          if (!item || !item.id) { continue; }
          var free = isModelFree(item);
          normalized.push({
            id: item.id,
            name: item.name || item.id,
            contextLength: item.context_length || undefined,
            free: free
          });
        }

        // Sort: free models first, then alphabetical by id
        normalized.sort(function (a, b) {
          if (a.free && !b.free) { return -1; }
          if (!a.free && b.free) { return 1; }
          return a.id.localeCompare(b.id);
        });

        return normalized;
      });
  }

  /**
   * Execute chat completion via OpenRouter.
   *
   * @param {Object} params { apiKey, baseUrl, model, messages, temperature, maxTokens, timeoutMs }
   * @returns {Promise<{ text: string, model: string, usage: Object|null }>}
   */
  function complete(params) {
    var key = params && params.apiKey;
    if (!key || typeof key !== 'string' || !key.trim()) {
      return Promise.reject(PE.errors.make(PE.errors.CODES.NO_KEY, null, 'key', LABEL));
    }

    var model = params && params.model;
    if (!model || typeof model !== 'string' || !model.trim()) {
      return Promise.reject(PE.errors.make(PE.errors.CODES.NO_MODEL, null, 'model', LABEL));
    }

    var base = (params && params.baseUrl) ? params.baseUrl : BASE_URL;
    var headers = buildHeaders(key);

    var body = {
      model: model.trim(),
      messages: params.messages || [],
      temperature: (typeof params.temperature === 'number') ? params.temperature : 0.3,
      max_tokens: params.maxTokens || 1500
    };

    var timeout = params.timeoutMs || (PE.C && PE.C.LIMITS && PE.C.LIMITS.TIMEOUT_PING_MODEL_MS) || 20000;

    return PE.providers.openaiCompatible.chatCompletion(base, headers, body, timeout, LABEL, model);
  }

  // Attach to PE.providers.openrouter
  PE.providers.openrouter = {
    id: ID,
    label: LABEL,
    keyPlaceholder: KEY_PLACEHOLDER,
    docsUrl: DOCS_URL,
    resolveBaseUrl: resolveBaseUrl,
    buildHeaders: buildHeaders,
    verifyKey: verifyKey,
    listModels: listModels,
    complete: complete
  };

}());
