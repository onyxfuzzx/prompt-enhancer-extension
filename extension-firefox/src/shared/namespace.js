// namespace.js — Prompt Enhancer
// Creates the global PE namespace object if it doesn't already exist.
// Must be the first script loaded in every context (popup, service worker, content scripts).
// Keep in sync with: all other PE files that attach to globalThis.PE

/* global globalThis */

(function () {
  'use strict';
  if (typeof globalThis.PE === 'undefined') {
    globalThis.PE = {};
  }
}());
