// custom.js — Prompt Enhancer
// Custom OpenAI-compatible provider adapter (e.g. self-hosted Ollama, LM Studio, vLLM, OpenAI).
// Loaded in service worker context.
// Must be loaded after openai-compatible.js.

/* global globalThis */

(function () {
  'use strict';

  var PE = globalThis.PE = globalThis.PE || {};
  PE.providers = PE.providers || {};

  var ID = 'custom';
  var LABEL = 'Custom (OpenAI-compatible)';
  var KEY_PLACEHOLDER = 'your-api-key (leave blank for Ollama/LM Studio)';
  var DOCS_URL = 'https://platform.openai.com/docs/api-reference';

  /**
   * Resolve and validate base URL from settings or form object.
   *
   * @param {Object} [settingsOrForm]
   * @returns {string}
   */
  function resolveBaseUrl(settingsOrForm) {
    var raw = '';
    if (settingsOrForm) {
      raw = settingsOrForm.customBaseUrl || settingsOrForm.baseUrl || '';
    }
    var trimmed = String(raw).trim().replace(/\/+$/, '');
    return trimmed;
  }

  /**
   * Validate that the custom base URL is well-formed.
   * Must be https:// or http://localhost / http://127.0.0.1.
   *
   * @param {string} url
   * @returns {boolean}
   */
  function isValidBaseUrl(url) {
    if (!url || typeof url !== 'string') { return false; }
    var clean = url.trim().toLowerCase();
    if (clean.indexOf('http://localhost') === 0 || clean.indexOf('http://127.0.0.1') === 0) {
      return true;
    }
    if (clean.indexOf('https://') === 0 && clean.length > 8) {
      return true;
    }
    return false;
  }

  /**
   * Build request headers for custom provider.
   * Authorization header is omitted if key is blank (for local servers).
   *
   * @param {string} [apiKey]
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
   * Stage 1: Verify API key / endpoint reachability.
   * Calls GET /models. If /models returns 404, treats as skipped so Stage 2 model ping runs.
   *
   * @param {Object} params { apiKey, baseUrl }
   * @returns {Promise<{ valid: boolean, info: string, skipped?: boolean }>}
   */
  function verifyKey(params) {
    var base = resolveBaseUrl(params);
    if (!base) {
      return Promise.reject(PE.errors.make(PE.errors.CODES.NO_BASE_URL, null, 'key', LABEL));
    }

    if (!isValidBaseUrl(base)) {
      return Promise.reject(PE.errors.make(PE.errors.CODES.BAD_REQUEST, 'Base URL must start with https:// or http://localhost', 'key', LABEL));
    }

    var key = params ? params.apiKey : '';
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
          info: 'Custom endpoint connected' + (count > 0 ? ' (' + count + ' models)' : '')
        };
      })
      .catch(function (err) {
        // If 404 (endpoint doesn't provide /models list), skip Stage 1 and let Stage 2 ping decide
        if (err && err.code === PE.errors.CODES.MODEL_NOT_FOUND) {
          return {
            valid: true,
            skipped: true,
            info: 'Endpoint does not expose /models — proceeding to model check'
          };
        }
        err.stage = 'key';
        throw err;
      });
  }

  /**
   * Fetch model list from custom endpoint. Returns [] if not supported.
   *
   * @param {Object} params { apiKey, baseUrl }
   * @returns {Promise<Array<{ id: string, name: string }>>}
   */
  function listModels(params) {
    var base = resolveBaseUrl(params);
    if (!base || !isValidBaseUrl(base)) {
      return Promise.resolve([]);
    }

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
            name: item.name || item.id
          });
        }

        normalized.sort(function (a, b) {
          return a.id.localeCompare(b.id);
        });

        return normalized;
      })
      .catch(function () {
        // On error or unsupported /models, gracefully fall back to empty list so free-text input works
        return [];
      });
  }

  /**
   * Execute chat completion via custom endpoint.
   *
   * @param {Object} params { apiKey, baseUrl, model, messages, temperature, maxTokens, timeoutMs }
   * @returns {Promise<{ text: string, model: string, usage: Object|null }>}
   */
  function complete(params) {
    var base = resolveBaseUrl(params);
    if (!base) {
      return Promise.reject(PE.errors.make(PE.errors.CODES.NO_BASE_URL, null, 'key', LABEL));
    }

    var model = params && params.model;
    if (!model || typeof model !== 'string' || !model.trim()) {
      return Promise.reject(PE.errors.make(PE.errors.CODES.NO_MODEL, null, 'model', LABEL));
    }

    var headers = buildHeaders(params && params.apiKey);

    var body = {
      model: model.trim(),
      messages: params.messages || [],
      temperature: (typeof params.temperature === 'number') ? params.temperature : 0.3,
      max_tokens: params.maxTokens || 1500
    };

    var timeout = params.timeoutMs || (PE.C && PE.C.LIMITS && PE.C.LIMITS.TIMEOUT_PING_MODEL_MS) || 20000;

    return PE.providers.openaiCompatible.chatCompletion(base, headers, body, timeout, LABEL, model);
  }

  // Attach to PE.providers.custom
  PE.providers.custom = {
    id: ID,
    label: LABEL,
    keyPlaceholder: KEY_PLACEHOLDER,
    docsUrl: DOCS_URL,
    resolveBaseUrl: resolveBaseUrl,
    isValidBaseUrl: isValidBaseUrl,
    buildHeaders: buildHeaders,
    verifyKey: verifyKey,
    listModels: listModels,
    complete: complete
  };

}());
