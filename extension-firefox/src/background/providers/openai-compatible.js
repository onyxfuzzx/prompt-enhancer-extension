// openai-compatible.js — Prompt Enhancer
// Shared helpers for OpenAI-compatible chat completion endpoints.
// Loaded in service worker context.
// Must be loaded after namespace.js, constants.js, errors.js, http.js.

/* global globalThis */

(function () {
  'use strict';

  var PE = globalThis.PE = globalThis.PE || {};
  PE.providers = PE.providers || {};

  /**
   * Extract text content from an OpenAI-style chat completion response.
   * Handles string content, multipart array parts, and reasoning models.
   *
   * @param {Object} json
   * @returns {string}
   */
  function extractText(json) {
    if (!json || !json.choices || !Array.isArray(json.choices) || json.choices.length === 0) {
      throw PE.errors.make(PE.errors.CODES.BAD_RESPONSE, 'Response missing choices array');
    }

    var choice = json.choices[0];
    var message = choice && (choice.message || choice.delta);
    if (!message) {
      throw PE.errors.make(PE.errors.CODES.BAD_RESPONSE, 'Response choice missing message object');
    }

    var content = message.content;

    // Content is non-empty string
    if (typeof content === 'string' && content.trim().length > 0) {
      return content;
    }

    // Content is array of parts [{ type: 'text', text: '...' }]
    if (Array.isArray(content) && content.length > 0) {
      var parts = [];
      for (var i = 0; i < content.length; i++) {
        var part = content[i];
        if (part && typeof part.text === 'string') {
          parts.push(part.text);
        } else if (typeof part === 'string') {
          parts.push(part);
        }
      }
      if (parts.length > 0) {
        return parts.join('\n');
      }
    }

    // Some completion endpoints return text directly on choice
    if (typeof choice.text === 'string' && choice.text.trim().length > 0) {
      return choice.text;
    }

    // Reasoning models fallback (when content is null or emitted in reasoning fields)
    if (typeof message.reasoning === 'string' && message.reasoning.trim().length > 0) {
      return message.reasoning;
    }
    if (Array.isArray(message.reasoning_details) && message.reasoning_details.length > 0) {
      var rText = message.reasoning_details.map(function (d) { return (d && d.text) || ''; }).join('\n');
      if (rText.trim().length > 0) {
        return rText;
      }
    }

    if (typeof content === 'string') {
      return content;
    }

    throw PE.errors.make(PE.errors.CODES.EMPTY_RESULT, 'Choice content is empty or unsupported format');
  }

  /**
   * Execute chat completion request against an OpenAI-compatible endpoint.
   *
   * @param {string} baseUrl
   * @param {Object} headers
   * @param {Object} body
   * @param {number} [timeoutMs]
   * @param {string} [providerLabel]
   * @param {string} [modelName]
   * @returns {Promise<{ text: string, model: string, usage: Object|null }>}
   */
  function chatCompletion(baseUrl, headers, body, timeoutMs, providerLabel, modelName) {
    var cleanBase = (baseUrl || '').replace(/\/+$/, '');
    var url = cleanBase + '/chat/completions';

    var mergedHeaders = Object.assign({
      'Content-Type': 'application/json'
    }, headers || {});

    var options = {
      method: 'POST',
      headers: mergedHeaders,
      body: JSON.stringify(body)
    };

    var timeout = timeoutMs || (PE.C && PE.C.LIMITS && PE.C.LIMITS.TIMEOUT_PING_MODEL_MS) || 20000;

    return PE.http.requestJson(url, options, timeout, providerLabel, modelName || body.model)
      .then(function (res) {
        var text = extractText(res);
        return {
          text: text,
          model: res.model || body.model || '',
          usage: res.usage || null
        };
      });
  }

  // Attach helpers to PE.providers.openaiCompatible
  PE.providers.openaiCompatible = {
    extractText: extractText,
    chatCompletion: chatCompletion
  };

}());
