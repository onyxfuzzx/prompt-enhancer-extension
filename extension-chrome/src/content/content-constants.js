// content-constants.js — Prompt Enhancer
// Lightweight mirror of message types and UI timing constants for content scripts.
// Content scripts MUST NOT load shared/storage.js or shared/constants.js directly.
// Keep in sync with: src/shared/constants.js
// Must be loaded first in the content script load order.

/* global globalThis */

(function () {
  'use strict';

  globalThis.PE = globalThis.PE || {};

  /** @namespace PE.C */
  globalThis.PE.C = globalThis.PE.C || {};

  // ---------------------------------------------------------------------------
  // Message types — must be byte-identical to shared/constants.js
  // ---------------------------------------------------------------------------
  globalThis.PE.C.MSG = {
    /** Popup/SW → Content: detect presence, return site id + hasTarget + charCount */
    PING_CONTENT:   'pe/ping-content',
    /** Popup/SW → Content: kick off the enhancement flow */
    START_ENHANCE:  'pe/start-enhance',
    /** Content → SW (and Popup → SW in manual mode): run enhancement */
    ENHANCE_PROMPT: 'pe/enhance-prompt',
    /** Popup/SW → Content: kick off the grammar correction flow */
    START_CORRECT_GRAMMAR: 'pe/start-correct-grammar',
    /** Content → SW (and Popup → SW in manual mode): run grammar correction */
    CORRECT_GRAMMAR: 'pe/correct-grammar',
    /** Content → SW (fire-and-forget): update the toolbar badge */
    ENHANCE_STATUS: 'pe/enhance-status',
    /** Content/Popup → SW: retrieve aggregated usage stats & limit status */
    GET_USAGE_STATS: 'pe/get-usage-stats'
  };

  // ---------------------------------------------------------------------------
  // Operational limits & UI timings — must match shared/constants.js
  // ---------------------------------------------------------------------------
  globalThis.PE.C.LIMITS = {
    /** Maximum characters of draft accepted for enhancement */
    MAX_INPUT_CHARS:      12000,
    /** Maximum characters of conversation context extracted from the page */
    MAX_CONTEXT_CHARS:    8000,
    /** Auto-hide delay (ms) for the success toast */
    TOAST_SUCCESS_MS:     8000,
    /** Auto-hide delay (ms) for the error toast */
    TOAST_ERROR_MS:       10000,
    /** Delay (ms) before popup auto-closes after acking START_ENHANCE */
    POPUP_CLOSE_DELAY_MS: 600
  };

}());
