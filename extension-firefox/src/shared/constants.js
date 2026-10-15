// constants.js — Prompt Enhancer
// Defines PE.C: all message types, storage keys, provider IDs, defaults, and limits.
// Keep in sync with: src/content/content-constants.js (for the MSG subset used there)
// Must be loaded after namespace.js.

/* global globalThis */

(function () {
  'use strict';

  var PE = globalThis.PE;

  /** @namespace PE.C */
  PE.C = {

    // -------------------------------------------------------------------------
    // Debug flag — set true for verbose console logging (gated behind this flag)
    // -------------------------------------------------------------------------
    DEBUG: false,

    // -------------------------------------------------------------------------
    // Message types — PE.C.MSG
    // All messages exchanged between popup, service worker, and content scripts.
    // String values MUST NOT change between phases — content-constants.js mirrors them.
    // -------------------------------------------------------------------------
    MSG: {
      /** Popup/SW → Content: detect presence, return site id + hasTarget + charCount */
      PING_CONTENT:      'pe/ping-content',
      /** Popup/SW → Content: kick off the enhancement flow */
      START_ENHANCE:     'pe/start-enhance',
      /** Content → SW (and Popup → SW in manual mode): run enhancement */
      ENHANCE_PROMPT:    'pe/enhance-prompt',
      /** Popup/SW → Content: kick off the grammar correction flow */
      START_CORRECT_GRAMMAR: 'pe/start-correct-grammar',
      /** Content → SW (and Popup → SW in manual mode): run grammar correction */
      CORRECT_GRAMMAR:   'pe/correct-grammar',
      /** Popup → SW: two-stage provider + model connectivity test */
      TEST_CONNECTION:   'pe/test-connection',
      /** Popup → SW: return available model list for a provider */
      LIST_MODELS:       'pe/list-models',
      /** Content → SW (fire-and-forget): update the toolbar badge */
      ENHANCE_STATUS:    'pe/enhance-status',
      /** Popup → SW: retrieve the last enhancement result */
      GET_LAST_RESULT:   'pe/get-last-result'
    },

    // -------------------------------------------------------------------------
    // chrome.storage.local keys — PE.C.STORAGE_KEYS
    // -------------------------------------------------------------------------
    STORAGE_KEYS: {
      /** Main settings object (see Section 4.1 schema) */
      SETTINGS:  'pe_settings',
      /** Transient last-result object (see Section 4.2) */
      RUNTIME:   'pe_runtime'
    },

    // -------------------------------------------------------------------------
    // Provider identifiers — PE.C.PROVIDERS
    // -------------------------------------------------------------------------
    PROVIDERS: {
      OPENROUTER: {
        id:             'openrouter',
        label:          'OpenRouter',
        baseUrl:        'https://openrouter.ai/api/v1',
        keyPlaceholder: 'sk-or-v1-…',
        docsUrl:        'https://openrouter.ai/keys'
      },
      OPENCODE: {
        id:             'opencode',
        label:          'OpenCode (Zen)',
        baseUrl:        'https://opencode.ai/zen/v1',
        keyPlaceholder: 'your-opencode-key',
        docsUrl:        'https://opencode.ai'
      },
      CUSTOM: {
        id:             'custom',
        label:          'Custom (OpenAI-compatible)',
        baseUrl:        '',
        keyPlaceholder: 'your-api-key (leave blank for Ollama/LM Studio)',
        docsUrl:        'https://platform.openai.com/docs/api-reference'
      }
    },

    // -------------------------------------------------------------------------
    // Default settings — PE.C.DEFAULTS
    // Mirrors the schema in Section 4.1. storage.js deep-merges stored values over these.
    // -------------------------------------------------------------------------
    DEFAULTS: {
      schemaVersion:     1,
      provider:          'openrouter',
      apiKeys: {
        openrouter:      '',
        opencode:        '',
        custom:          ''
      },
      models: {
        openrouter:      'openai/gpt-4o-mini',
        opencode:        '',
        custom:          ''
      },
      customBaseUrl:     '',
      customSystemRules: '',
      enhancementStyle:  'balanced',
      includeChatContext: true,
      useMarkdownFormatting: false,
      alwaysIncludeRole: false,
      maxContextTurns:   6,
      temperature:       0.3,
      maxOutputTokens:   1500,
      lastTest:          null
    },

    // -------------------------------------------------------------------------
    // Operational limits — PE.C.LIMITS
    // -------------------------------------------------------------------------
    LIMITS: {
      /** Maximum characters of the draft that will be accepted for enhancement */
      MAX_INPUT_CHARS:        12000,
      /** Maximum characters of conversation context extracted from the page */
      MAX_CONTEXT_CHARS:      8000,
      /** Maximum characters for custom system rules */
      MAX_RULES_CHARS:        4000,
      /** Timeout (ms) for key verification and model listing calls */
      TIMEOUT_TEST_MS:        15000,
      /** Timeout (ms) for the model ping call during Test Connection stage 2 */
      TIMEOUT_PING_MODEL_MS:  20000,
      /** Timeout (ms) for the full enhancement call */
      TIMEOUT_ENHANCE_MS:     60000,
      /** Auto-hide delay (ms) for the success toast */
      TOAST_SUCCESS_MS:       8000,
      /** Auto-hide delay (ms) for the error toast */
      TOAST_ERROR_MS:         10000,
      /** Delay (ms) before popup auto-closes after acking START_ENHANCE */
      POPUP_CLOSE_DELAY_MS:   600,
      /** Delay (ms) before retrying after a network/5xx error on enhancement */
      RETRY_DELAY_MS:         1500,
      /** Badge clear delay (ms) after success (✓) */
      BADGE_SUCCESS_CLEAR_MS: 3000,
      /** Badge clear delay (ms) after error (!) */
      BADGE_ERROR_CLEAR_MS:   5000
    }

  };

}());
