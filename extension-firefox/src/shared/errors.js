// errors.js — Prompt Enhancer
// Error codes, error normalization, user-friendly messages, and key redactor.
// Shared between popup and service worker (Phase 2+).
// Must be loaded after namespace.js and constants.js.

/* global globalThis */

(function () {
  'use strict';

  var PE = globalThis.PE = globalThis.PE || {};

  /**
   * Error codes enumeration.
   */
  var CODES = {
    // Network & HTTP
    NETWORK_ERROR:        'NETWORK',
    TIMEOUT:              'TIMEOUT',
    BAD_REQUEST:          'BAD_REQUEST',
    KEY_INVALID:          'INVALID_KEY',
    INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
    MODEL_NOT_FOUND:      'MODEL_NOT_FOUND',
    MODEL_REJECTED:       'MODEL_REJECTED',
    RATE_LIMITED:         'RATE_LIMITED',
    SERVER_ERROR:         'PROVIDER_ERROR',
    BAD_RESPONSE:         'BAD_RESPONSE',
    PARSE_ERROR:          'PARSE_ERROR',

    // Validation & State
    NO_KEY:               'NO_API_KEY',
    NO_MODEL:             'NO_MODEL',
    NO_BASE_URL:          'NO_BASE_URL',
    PERMISSION_DENIED:    'PERMISSION_DENIED',
    EMPTY_RESULT:         'EMPTY_RESULT',
    INPUT_EMPTY:          'INPUT_EMPTY',
    INPUT_TOO_LONG:       'INPUT_TOO_LONG',
    CONTEXT_TOO_LONG:     'CONTEXT_TOO_LONG',
    NO_TARGET:            'NO_TARGET',
    BUSY:                 'BUSY',
    INJECTION_FAILED:     'INJECTION_FAILED',
    UNSUPPORTED_PAGE:     'UNSUPPORTED_PAGE',
    NOT_IMPLEMENTED:      'NOT_IMPLEMENTED',
    UNKNOWN_MESSAGE:      'UNKNOWN_MESSAGE',
    UNKNOWN:              'UNKNOWN',
    LIMIT_REACHED:        'LIMIT_REACHED'
  };

  /**
   * Redact API key strings from text.
   * If a specific key is passed, replaces occurrences of that key.
   * Also masks patterns that look like API keys (e.g. sk-...).
   *
   * @param {string} text
   * @param {string} [specificKey]
   * @returns {string}
   */
  function redact(text, specificKey) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    var result = text;

    // 1. Redact specific known key if provided
    if (specificKey && typeof specificKey === 'string' && specificKey.trim().length >= 8) {
      var trimmed = specificKey.trim();
      var masked = trimmed.slice(0, 5) + '…' + trimmed.slice(-4);
      result = result.split(trimmed).join(masked);
    }

    // 2. Generic regex for sk-... or long authorization token strings
    result = result.replace(/\b(sk-[a-zA-Z0-9_-]{4})[a-zA-Z0-9_-]{4,}([a-zA-Z0-9_-]{4})\b/g, '$1…$2');

    // 3. Redact Bearer headers if present
    result = result.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{8,}/gi, 'Bearer [REDACTED]');

    return result;
  }

  /**
   * Convert an error code / object to a user-facing explanation.
   *
   * @param {Object|string} err
   * @param {string} [providerLabel]
   * @param {string} [modelName]
   * @returns {string}
   */
  function toUserMessage(err, providerLabel, modelName) {
    var code = (typeof err === 'string') ? err : (err && err.code ? err.code : CODES.UNKNOWN);
    var provider = providerLabel || 'the provider';
    var model = modelName || (err && err.model) || 'selected model';
    var detail = (err && err.detail) ? String(err.detail) : '';

    switch (code) {
      case CODES.NETWORK_ERROR:
      case 'NETWORK':
        return "Couldn't reach " + provider + ". Check your internet connection.";

      case CODES.TIMEOUT:
        return provider + " took too long to respond. Try again or pick a faster model.";

      case CODES.BAD_REQUEST:
        return detail ? ("The provider rejected the request: " + detail) : ("The provider rejected the request.");

      case CODES.KEY_INVALID:
      case 'INVALID_KEY':
        return "API key is invalid or lacks permission.";

      case CODES.NO_KEY:
      case 'NO_API_KEY':
        return "No API key configured for " + provider + ".";

      case CODES.NO_MODEL:
        return "Please enter or select a model.";

      case CODES.NO_BASE_URL:
        return "Base URL is required for custom provider.";

      case CODES.INSUFFICIENT_CREDITS:
        return "Your account has insufficient credits for this model.";

      case CODES.MODEL_NOT_FOUND:
        return "Model '" + model + "' was not found for this provider.";

      case CODES.MODEL_REJECTED:
        return "Model '" + model + "' is not supported by this provider endpoint.";

      case CODES.RATE_LIMITED:
        return "Rate limited. Wait a moment and retry.";

      case CODES.SERVER_ERROR:
      case 'PROVIDER_ERROR':
        return provider + " is having problems" + (detail ? " (" + detail + ")" : ".") ;

      case CODES.BAD_RESPONSE:
      case CODES.PARSE_ERROR:
        return "Unexpected response from the provider.";

      case CODES.EMPTY_RESULT:
        return "The model returned an empty result.";

      case CODES.PERMISSION_DENIED:
        return "Permission to access host was denied.";

      case CODES.INPUT_EMPTY:
        return "Type a draft prompt first.";

      case CODES.INPUT_TOO_LONG:
        return "Prompt is too long (exceeds character limit).";

      case CODES.CONTEXT_TOO_LONG:
        return "Draft exceeds model context window limit.";

      case CODES.NO_TARGET:
        return "Click into the chat box first.";

      case CODES.BUSY:
        return "An enhancement is already in progress.";

      case CODES.INJECTION_FAILED:
        return "Couldn't insert enhanced prompt automatically.";

      case CODES.UNSUPPORTED_PAGE:
        return "Can't run on this page.";

      case CODES.NOT_IMPLEMENTED:
        return "This feature is not yet implemented.";

      case CODES.UNKNOWN_MESSAGE:
        return "Unknown message type.";

      case CODES.LIMIT_REACHED:
        return "Usage limit reached. Adjust your limits in Settings \u2192 Stats.";

      default:
        return (err && err.message) ? err.message : "An unexpected error occurred.";
    }
  }

  /**
   * Factory function to construct a standard PEError structure.
   *
   * @param {string} code
   * @param {string|Error} [detail]
   * @param {'key'|'model'|null} [stage]
   * @param {string} [providerLabel]
   * @param {string} [modelName]
   * @returns {Object}
   */
  function make(code, detail, stage, providerLabel, modelName) {
    var rawDetail = '';
    if (detail) {
      rawDetail = (detail instanceof Error) ? (detail.message || String(detail)) : String(detail);
    }
    var cleanDetail = redact(rawDetail);

    var errObj = {
      code: code || CODES.UNKNOWN,
      message: toUserMessage(code, providerLabel, modelName),
      detail: cleanDetail || undefined,
      stage: stage || undefined
    };

    return errObj;
  }

  /**
   * Check if an object looks like a PE error.
   *
   * @param {*} x
   * @returns {boolean}
   */
  function isPEError(x) {
    return Boolean(x && (typeof x.code === 'string' || (x.error && typeof x.error.code === 'string')));
  }

  // Attach to PE namespace
  PE.errors = {
    CODES: CODES,
    make: make,
    toUserMessage: toUserMessage,
    redact: redact,
    isPEError: isPEError
  };

}());
