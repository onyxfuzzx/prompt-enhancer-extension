// storage.js — Prompt Enhancer
// Typed get/set/reset for chrome.storage.local with defaults deep-merging.
// Only this file reads or writes storage directly.
// Must be loaded after namespace.js and constants.js.

/* global globalThis, chrome, localStorage */

(function () {
  'use strict';

  var PE = globalThis.PE = globalThis.PE || {};

  var SETTINGS_KEY = (PE.C && PE.C.STORAGE_KEYS && PE.C.STORAGE_KEYS.SETTINGS) || 'pe_settings';
  var RUNTIME_KEY  = (PE.C && PE.C.STORAGE_KEYS && PE.C.STORAGE_KEYS.RUNTIME)  || 'pe_runtime';
  var DEFAULTS     = (PE.C && PE.C.DEFAULTS) || {};

  /**
   * Safe storage driver: uses chrome.storage.local if available,
   * falls back to localStorage or in-memory when run outside extension context (e.g. testing).
   */
  var memoryStore = {};

  var driver = {
    get: function (key, cb) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(key, cb);
      } else if (typeof localStorage !== 'undefined') {
        try {
          var item = localStorage.getItem(key);
          var res = {};
          res[key] = item ? JSON.parse(item) : undefined;
          cb(res);
        } catch (e) {
          cb({});
        }
      } else {
        var memRes = {};
        memRes[key] = memoryStore[key];
        cb(memRes);
      }
    },
    set: function (obj, cb) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj, cb);
      } else if (typeof localStorage !== 'undefined') {
        try {
          for (var k in obj) {
            localStorage.setItem(k, JSON.stringify(obj[k]));
          }
          if (cb) { cb(); }
        } catch (e) {
          if (cb) { cb(); }
        }
      } else {
        for (var mk in obj) {
          memoryStore[mk] = obj[mk];
        }
        if (cb) { cb(); }
      }
    },
    remove: function (key, cb) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(key, cb);
      } else if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem(key);
          if (cb) { cb(); }
        } catch (e) {
          if (cb) { cb(); }
        }
      } else {
        delete memoryStore[key];
        if (cb) { cb(); }
      }
    }
  };

  /**
   * Deep clone a plain JSON object.
   * @param {*} obj
   * @returns {*}
   */
  function clone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Deep merge source into target. Modifies target.
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
   */
  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') {
      return target;
    }
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        var sVal = source[key];
        if (sVal && typeof sVal === 'object' && !Array.isArray(sVal)) {
          if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
            target[key] = {};
          }
          deepMerge(target[key], sVal);
        } else if (sVal !== undefined) {
          target[key] = sVal;
        }
      }
    }
    return target;
  }

  /**
   * Normalizes a settings object:
   * - Trims strings
   * - Normalizes customBaseUrl (no trailing slash)
   * - Clamps temperature and maxOutputTokens
   * @param {Object} settings
   * @returns {Object}
   */
  function normalizeSettings(settings) {
    var s = clone(settings);

    // Trim apiKeys
    if (s.apiKeys && typeof s.apiKeys === 'object') {
      for (var p in s.apiKeys) {
        if (typeof s.apiKeys[p] === 'string') {
          s.apiKeys[p] = s.apiKeys[p].trim();
        }
      }
    }

    // Trim models
    if (s.models && typeof s.models === 'object') {
      for (var m in s.models) {
        if (typeof s.models[m] === 'string') {
          s.models[m] = s.models[m].trim();
        }
      }
    }

    // Trim & normalize customBaseUrl (remove trailing slash)
    if (typeof s.customBaseUrl === 'string') {
      s.customBaseUrl = s.customBaseUrl.trim().replace(/\/+$/, '');
    }

    // Clamp temperature (0 - 1)
    if (typeof s.temperature === 'number') {
      s.temperature = Math.max(0, Math.min(1, s.temperature));
    } else if (typeof s.temperature === 'string') {
      var t = parseFloat(s.temperature);
      s.temperature = isNaN(t) ? 0.3 : Math.max(0, Math.min(1, t));
    }

    // Clamp maxOutputTokens (256 - 4000)
    if (typeof s.maxOutputTokens === 'number') {
      s.maxOutputTokens = Math.max(256, Math.min(4000, Math.round(s.maxOutputTokens)));
    } else if (typeof s.maxOutputTokens === 'string') {
      var tok = parseInt(s.maxOutputTokens, 10);
      s.maxOutputTokens = isNaN(tok) ? 1500 : Math.max(256, Math.min(4000, tok));
    }

    return s;
  }

  /**
   * Retrieve current settings. Always returns a fully populated object merged over DEFAULTS.
   * @returns {Promise<Object>}
   */
  function getSettings() {
    return new Promise(function (resolve, reject) {
      try {
        driver.get(SETTINGS_KEY, function (result) {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }
          var stored = result && result[SETTINGS_KEY];
          var merged = deepMerge(clone(DEFAULTS), stored || {});
          resolve(normalizeSettings(merged));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Deep-merge partial updates into stored settings and persist.
   * @param {Object} partial
   * @returns {Promise<Object>} Updated settings
   */
  function saveSettings(partial) {
    return getSettings().then(function (current) {
      var merged = deepMerge(current, partial || {});
      var normalized = normalizeSettings(merged);
      return new Promise(function (resolve, reject) {
        var payload = {};
        payload[SETTINGS_KEY] = normalized;
        driver.set(payload, function () {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }
          resolve(normalized);
        });
      });
    });
  }

  /**
   * Reset all settings to factory DEFAULTS.
   * @returns {Promise<Object>} Default settings
   */
  function resetSettings() {
    var fresh = normalizeSettings(clone(DEFAULTS));
    return new Promise(function (resolve, reject) {
      var payload = {};
      payload[SETTINGS_KEY] = fresh;
      driver.set(payload, function () {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(fresh);
      });
    });
  }

  /**
   * Subscribe to changes on the settings object.
   * @param {Function} callback (newSettings, oldSettings)
   */
  function onSettingsChanged(callback) {
    if (typeof callback !== 'function') { return; }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName === 'local' && changes[SETTINGS_KEY]) {
          var newVal = changes[SETTINGS_KEY].newValue ? normalizeSettings(deepMerge(clone(DEFAULTS), changes[SETTINGS_KEY].newValue)) : null;
          var oldVal = changes[SETTINGS_KEY].oldValue ? normalizeSettings(deepMerge(clone(DEFAULTS), changes[SETTINGS_KEY].oldValue)) : null;
          callback(newVal, oldVal);
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Transient Runtime State (pe_runtime)
  // ---------------------------------------------------------------------------

  var MAX_RUNTIME_AGE_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Store last enhancement result.
   * @param {Object} result { enhancedText, tabUrl }
   * @returns {Promise<void>}
   */
  function setLastResult(result) {
    return new Promise(function (resolve, reject) {
      if (!result) { return resolve(); }
      var payload = {};
      payload[RUNTIME_KEY] = {
        lastResult: {
          enhancedText: result.enhancedText || '',
          tabUrl: result.tabUrl || '',
          at: Date.now()
        }
      };
      driver.set(payload, function () {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }

  /**
   * Retrieve last enhancement result. Returns null if expired (>10 min) or missing.
   * @returns {Promise<Object|null>}
   */
  function getLastResult() {
    return new Promise(function (resolve, reject) {
      driver.get(RUNTIME_KEY, function (res) {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        var runtime = res && res[RUNTIME_KEY];
        var last = runtime && runtime.lastResult;
        if (!last) { return resolve(null); }
        if (Date.now() - last.at > MAX_RUNTIME_AGE_MS) {
          driver.remove(RUNTIME_KEY, function () {
            resolve(null);
          });
        } else {
          resolve(last);
        }
      });
    });
  }

  /**
   * Clear last result explicitly.
   * @returns {Promise<void>}
   */
  function clearLastResult() {
    return new Promise(function (resolve, reject) {
      driver.remove(RUNTIME_KEY, function () {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }

  // Attach to PE namespace
  PE.storage = {
    getSettings: getSettings,
    saveSettings: saveSettings,
    resetSettings: resetSettings,
    onSettingsChanged: onSettingsChanged,
    setLastResult: setLastResult,
    getLastResult: getLastResult,
    clearLastResult: clearLastResult
  };

}());
