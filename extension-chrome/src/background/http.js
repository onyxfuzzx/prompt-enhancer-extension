// http.js — Prompt Enhancer
// HTTP fetch wrapper with AbortController timeout, status-to-error mapping, and key redaction.
// Loaded in background service worker context.
// Must be loaded after namespace.js, constants.js, and errors.js.

/* global globalThis */

(function () {
  'use strict';

  var PE = globalThis.PE = globalThis.PE || {};

  /**
   * Safe JSON parse helper.
   * @param {string} text
   * @returns {Object|null}
   */
  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  /**
   * Execute an HTTP request expecting a JSON response.
   *
   * @param {string} url
   * @param {RequestInit} [options]
   * @param {number} [timeoutMs]
   * @param {string} [providerLabel]
   * @param {string} [modelName]
   * @returns {Promise<Object>} Resolves to parsed JSON data
   */
  function requestJson(url, options, timeoutMs, providerLabel, modelName) {
    var opts = options || {};
    var timeout = timeoutMs || (PE.C && PE.C.LIMITS && PE.C.LIMITS.TIMEOUT_TEST_MS) || 15000;
    var controller = new AbortController();
    var signal = controller.signal;

    // Support caller's existing signal if provided
    if (opts.signal) {
      opts.signal.addEventListener('abort', function () {
        controller.abort();
      });
    }
    opts.signal = signal;

    var timer = setTimeout(function () {
      controller.abort();
    }, timeout);

    return fetch(url, opts)
      .then(function (res) {
        clearTimeout(timer);

        return res.text().then(function (rawText) {
          var jsonBody = safeJsonParse(rawText);
          var status = res.status;

          // Extract server error message if available
          var serverMessage = '';
          if (jsonBody && jsonBody.error) {
            if (typeof jsonBody.error === 'string') {
              serverMessage = jsonBody.error;
            } else if (typeof jsonBody.error.message === 'string') {
              serverMessage = jsonBody.error.message;
            }
          } else if (!jsonBody && rawText) {
            serverMessage = rawText.slice(0, 300);
          }

          // Check if response is HTTP OK
          if (res.ok) {
            // Some providers (e.g. OpenRouter) can return HTTP 200 with { error: ... }
            if (jsonBody && jsonBody.error) {
              var errDetail = serverMessage || 'Provider returned an error in response body';
              var code = PE.errors.CODES.BAD_RESPONSE;
              if (/invalid.*key|unauthorized|auth/i.test(errDetail)) {
                code = PE.errors.CODES.KEY_INVALID;
              } else if (/credit|quota|balance/i.test(errDetail)) {
                code = PE.errors.CODES.INSUFFICIENT_CREDITS;
              } else if (/rate.*limit/i.test(errDetail)) {
                code = PE.errors.CODES.RATE_LIMITED;
              }
              throw PE.errors.make(code, errDetail, null, providerLabel, modelName);
            }

            if (!jsonBody && rawText.trim().length > 0) {
              throw PE.errors.make(PE.errors.CODES.BAD_RESPONSE, 'Response was not valid JSON: ' + rawText.slice(0, 100), null, providerLabel, modelName);
            }

            return jsonBody;
          }

          // Handle HTTP error statuses
          switch (status) {
            case 400:
              throw PE.errors.make(PE.errors.CODES.BAD_REQUEST, serverMessage || 'HTTP 400 Bad Request', null, providerLabel, modelName);

            case 401:
            case 403:
              throw PE.errors.make(PE.errors.CODES.KEY_INVALID, serverMessage || 'HTTP ' + status + ' Unauthorized', 'key', providerLabel, modelName);

            case 402:
              throw PE.errors.make(PE.errors.CODES.INSUFFICIENT_CREDITS, serverMessage || 'HTTP 402 Payment Required', null, providerLabel, modelName);

            case 404:
              throw PE.errors.make(PE.errors.CODES.MODEL_NOT_FOUND, serverMessage || 'HTTP 404 Not Found', 'model', providerLabel, modelName);

            case 408:
            case 504:
              throw PE.errors.make(PE.errors.CODES.TIMEOUT, serverMessage || 'HTTP ' + status + ' Timeout', null, providerLabel, modelName);

            case 429:
              var retryAfter = res.headers ? res.headers.get('Retry-After') : null;
              var rateMsg = serverMessage;
              if (retryAfter) {
                rateMsg = (rateMsg ? rateMsg + ' ' : '') + '(Retry-After: ' + retryAfter + 's)';
              }
              throw PE.errors.make(PE.errors.CODES.RATE_LIMITED, rateMsg || 'HTTP 429 Too Many Requests', null, providerLabel, modelName);

            default:
              if (status >= 500) {
                throw PE.errors.make(PE.errors.CODES.SERVER_ERROR, 'HTTP ' + status + (serverMessage ? ': ' + serverMessage : ''), null, providerLabel, modelName);
              }
              throw PE.errors.make(PE.errors.CODES.UNKNOWN, 'HTTP ' + status + (serverMessage ? ': ' + serverMessage : ''), null, providerLabel, modelName);
          }
        });
      })
      .catch(function (err) {
        clearTimeout(timer);

        // If it's already a PE error structure, rethrow
        if (PE.errors.isPEError(err)) {
          throw err;
        }

        // AbortController timeout
        if (err && err.name === 'AbortError') {
          throw PE.errors.make(PE.errors.CODES.TIMEOUT, 'Request timed out after ' + timeout + ' ms', null, providerLabel, modelName);
        }

        // TypeError: DNS, offline, connection refused, CORS
        var msg = (err && err.message) ? err.message : String(err);
        throw PE.errors.make(PE.errors.CODES.NETWORK_ERROR, msg, null, providerLabel, modelName);
      });
  }

  // Attach to PE namespace
  PE.http = {
    requestJson: requestJson
  };

}());
