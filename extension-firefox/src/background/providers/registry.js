// registry.js — Prompt Enhancer
// Provider registry lookup.
// Loaded in service worker context.
// Must be loaded after all provider adapter files.

/* global globalThis */

(function () {
  'use strict';

  var PE = globalThis.PE = globalThis.PE || {};
  PE.providers = PE.providers || {};

  var registry = {
    openrouter: PE.providers.openrouter,
    opencode:   PE.providers.opencode,
    custom:     PE.providers.custom
  };

  /**
   * Retrieve a provider adapter by ID. Defaults to openrouter.
   *
   * @param {string} id
   * @returns {Object} Provider adapter
   */
  function get(id) {
    var key = (id || '').toLowerCase().trim();
    if (registry[key]) {
      return registry[key];
    }
    return registry.openrouter;
  }

  /**
   * List all registered provider adapters.
   * @returns {Array<Object>}
   */
  function list() {
    return [
      registry.openrouter,
      registry.opencode,
      registry.custom
    ];
  }

  // Attach to PE.providers
  PE.providers.get = get;
  PE.providers.list = list;

}());
