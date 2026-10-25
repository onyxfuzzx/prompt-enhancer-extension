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

  // ---------------------------------------------------------------------------
  // Usage Tracking (pe_usage)
  // ---------------------------------------------------------------------------

  var USAGE_KEY    = (PE.C && PE.C.STORAGE_KEYS && PE.C.STORAGE_KEYS.USAGE) || 'pe_usage';
  var MAX_ENTRIES  = (PE.C && PE.C.LIMITS && PE.C.LIMITS.MAX_USAGE_LOG_ENTRIES) || 500;

  /**
   * Load raw usage data from storage.
   * @returns {Promise<Object>} { log: [], limits: { daily, weekly, monthly } }
   */
  function loadUsageData() {
    return new Promise(function (resolve, reject) {
      driver.get(USAGE_KEY, function (res) {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        var data = (res && res[USAGE_KEY]) || {};
        resolve({
          log: Array.isArray(data.log) ? data.log : [],
          limits: data.limits || { daily: 0, weekly: 0, monthly: 0 }
        });
      });
    });
  }

  /**
   * Save raw usage data back to storage.
   * @param {Object} data { log, limits }
   * @returns {Promise<void>}
   */
  function saveUsageData(data) {
    return new Promise(function (resolve, reject) {
      var payload = {};
      payload[USAGE_KEY] = data;
      driver.set(payload, function () {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }

  /**
   * Record a single enhancement/grammar usage event.
   * @param {Object} entry
   *   { type: 'enhance'|'grammar', provider, model, domain, inputChars, outputChars, latencyMs }
   * @returns {Promise<void>}
   */
  function recordUsage(entry) {
    if (!entry) { return Promise.resolve(); }
    return loadUsageData().then(function (data) {
      var newEntry = {
        ts:          Date.now(),
        type:        entry.type        || 'enhance',
        provider:    entry.provider    || '',
        model:       entry.model       || '',
        domain:      entry.domain      || '',
        inputChars:  entry.inputChars  || 0,
        outputChars: entry.outputChars || 0,
        latencyMs:   entry.latencyMs   || 0
      };
      data.log.push(newEntry);
      // Rolling cap: keep most recent MAX_ENTRIES
      if (data.log.length > MAX_ENTRIES) {
        data.log = data.log.slice(data.log.length - MAX_ENTRIES);
      }
      return saveUsageData(data);
    }).catch(function (e) {
      if (PE.C && PE.C.DEBUG) { console.warn('[PE] recordUsage failed:', e); }
    });
  }

  /**
   * Check current usage against configured limits.
   * @returns {Promise<Object>} { ok: bool, exceeded: 'daily'|'weekly'|'monthly'|null, used, limit }
   */
  function checkLimits() {
    return Promise.all([loadUsageData(), getSettings()]).then(function (results) {
      var data     = results[0];
      var settings = results[1];
      var limits   = (settings && settings.usageLimits) || { daily: 0, weekly: 0, monthly: 0 };

      var now   = Date.now();
      var day   = 24 * 60 * 60 * 1000;
      var week  = 7  * day;
      var month = 30 * day;

      var startOfDay   = now - day;
      var startOfWeek  = now - week;
      var startOfMonth = now - month;

      var dailyCount   = 0;
      var weeklyCount  = 0;
      var monthlyCount = 0;

      for (var i = 0; i < data.log.length; i++) {
        var ts = data.log[i].ts;
        if (ts >= startOfMonth) { monthlyCount++; }
        if (ts >= startOfWeek)  { weeklyCount++;  }
        if (ts >= startOfDay)   { dailyCount++;   }
      }

      if (limits.daily  > 0 && dailyCount   >= limits.daily)   {
        return { ok: false, exceeded: 'daily',   used: dailyCount,   limit: limits.daily   };
      }
      if (limits.weekly > 0 && weeklyCount  >= limits.weekly)  {
        return { ok: false, exceeded: 'weekly',  used: weeklyCount,  limit: limits.weekly  };
      }
      if (limits.monthly > 0 && monthlyCount >= limits.monthly) {
        return { ok: false, exceeded: 'monthly', used: monthlyCount, limit: limits.monthly };
      }

      return {
        ok: true,
        exceeded: null,
        daily:   { used: dailyCount,   limit: limits.daily   },
        weekly:  { used: weeklyCount,  limit: limits.weekly  },
        monthly: { used: monthlyCount, limit: limits.monthly }
      };
    });
  }

  /**
   * Compute aggregated stats from the usage log.
   * @returns {Promise<Object>}
   */
  function getUsageStats() {
    return Promise.all([loadUsageData(), getSettings()]).then(function (results) {
      var data     = results[0];
      var settings = results[1];
      var log      = data.log;
      var limits   = (settings && settings.usageLimits) || { daily: 0, weekly: 0, monthly: 0 };

      var now   = Date.now();
      var day   = 24 * 60 * 60 * 1000;

      var startOfToday   = now - day;
      var startOfWeek    = now - 7 * day;
      var startOfMonth   = now - 30 * day;

      var counts = { today: 0, week: 0, month: 0, allTime: 0 };
      var byType = { enhance: { today: 0, week: 0, month: 0, allTime: 0 },
                     grammar:  { today: 0, week: 0, month: 0, allTime: 0 } };
      var totalInputChars  = 0;
      var totalOutputChars = 0;
      var totalLatencyMs   = 0;
      var latencyCount     = 0;
      var domainMap        = {};

      // Last 7 days buckets (index 0 = oldest, 6 = today)
      var dailyBuckets = [0, 0, 0, 0, 0, 0, 0];

      for (var i = 0; i < log.length; i++) {
        var entry = log[i];
        var ts    = entry.ts;
        var type  = entry.type || 'enhance';

        counts.allTime++;
        if (byType[type]) { byType[type].allTime++; }
        if (ts >= startOfMonth) { counts.month++;  if (byType[type]) { byType[type].month++;  } }
        if (ts >= startOfWeek)  { counts.week++;   if (byType[type]) { byType[type].week++;   } }
        if (ts >= startOfToday) { counts.today++;  if (byType[type]) { byType[type].today++;  } }

        totalInputChars  += (entry.inputChars  || 0);
        totalOutputChars += (entry.outputChars || 0);

        if (entry.latencyMs && entry.latencyMs > 0) {
          totalLatencyMs += entry.latencyMs;
          latencyCount++;
        }

        // Domain tally
        if (entry.domain) {
          domainMap[entry.domain] = (domainMap[entry.domain] || 0) + 1;
        }

        // Daily bucket (last 7 days): which day ago is this?
        var ageMs   = now - ts;
        var dayAgo  = Math.floor(ageMs / day);
        if (dayAgo >= 0 && dayAgo < 7) {
          dailyBuckets[6 - dayAgo]++;
        }
      }

      // Cost estimate (input tokens ~ chars/4, output tokens ~ chars/4)
      var inputTokens  = Math.round(totalInputChars / 4);
      var outputTokens = Math.round(totalOutputChars / 4);
      var totalTokens  = inputTokens + outputTokens;

      // Top 5 domains
      var domainList = [];
      for (var d in domainMap) {
        if (Object.prototype.hasOwnProperty.call(domainMap, d)) {
          domainList.push({ domain: d, count: domainMap[d] });
        }
      }
      domainList.sort(function (a, b) { return b.count - a.count; });
      var topDomains = domainList.slice(0, 5);

      return {
        counts:      counts,
        byType:      byType,
        tokens:      { input: inputTokens, output: outputTokens, total: totalTokens },
        avgLatencyMs: latencyCount > 0 ? Math.round(totalLatencyMs / latencyCount) : 0,
        dailyBuckets: dailyBuckets,
        topDomains:  topDomains,
        limits:      limits,
        logLength:   log.length
      };
    });
  }

  /**
   * Save usage limit settings.
   * @param {Object} limits { daily, weekly, monthly }
   * @returns {Promise<void>}
   */
  function saveUsageLimits(limits) {
    return loadUsageData().then(function (data) {
      data.limits = {
        daily:   parseInt(limits.daily,   10) || 0,
        weekly:  parseInt(limits.weekly,  10) || 0,
        monthly: parseInt(limits.monthly, 10) || 0
      };
      return saveUsageData(data);
    });
  }

  /**
   * Clear all usage log entries (keeps limits).
   * @returns {Promise<void>}
   */
  function clearUsage() {
    return loadUsageData().then(function (data) {
      data.log = [];
      return saveUsageData(data);
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
    clearLastResult: clearLastResult,
    recordUsage: recordUsage,
    checkLimits: checkLimits,
    getUsageStats: getUsageStats,
    saveUsageLimits: saveUsageLimits,
    clearUsage: clearUsage
  };

}());
