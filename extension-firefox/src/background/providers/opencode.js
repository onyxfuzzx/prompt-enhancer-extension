// opencode.js — Prompt Enhancer
// OpenCode (Zen) provider adapter.
// Loaded in service worker context.
// Must be loaded after openai-compatible.js.

/* global globalThis */

(function () {
  'use strict';

  var PE = globalThis.PE = globalThis.PE || {};
  PE.providers = PE.providers || {};

  var ID = 'opencode';
  var LABEL = 'OpenCode (Zen)';
  var BASE_URL = 'https://opencode.ai/zen/v1';
  var KEY_PLACEHOLDER = 'your-opencode-key';
  var DOCS_URL = 'https://opencode.ai';

  /**
   * Return the resolved base URL.
   * @returns {string}
   */
  function resolveBaseUrl() {
    return BASE_URL;
  }

  /**
   * Build request headers for OpenCode Zen.
   * @param {string} apiKey
   * @returns {Object}
   */
  function buildHeaders(apiKey) {
    var headers = {};
    if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
      headers.Authorization = 'Bearer ' + apiKey.trim();
    }
    return headers;
  }

  /**
   * Stage 1: Verify API key against OpenCode Zen by calling GET /models.
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

    return PE.http.requestJson(base + '/models', { method: 'GET', headers: headers }, timeout, LABEL)
      .then(function (res) {
        var count = 0;
        if (res && Array.isArray(res.data)) {
          count = res.data.length;
        } else if (Array.isArray(res)) {
          count = res.length;
        }
        return {
          valid: true,
          info: 'Key valid · ' + (count > 0 ? count + ' models available' : 'OpenCode connected')
        };
      })
      .catch(function (err) {
        err.stage = 'key';
        throw err;
      });
  }

  /**
   * Fetch and return normalized model list from OpenCode Zen.
   *
   * @param {Object} params { apiKey, baseUrl }
   * @returns {Promise<Array<{ id: string, name: string, contextLength?: number }>>}
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
          normalized.push({
            id: item.id,
            name: item.name || item.id,
            contextLength: item.context_length || undefined
          });
        }

        normalized.sort(function (a, b) {
          return a.id.localeCompare(b.id);
        });

        return normalized;
      });
  }

  /**
   * Execute chat completion via OpenCode Zen.
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

  // Attach to PE.providers.opencode
  PE.providers.opencode = {
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
