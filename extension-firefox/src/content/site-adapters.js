// site-adapters.js — Prompt Enhancer
// Defines PE.sites: registry of site-specific DOM selectors and strategies
// for target AI platforms (ChatGPT, Claude, Gemini) and a generic fallback.
// Must be loaded after content-constants.js in the content script load order.

/* global globalThis */

(function () {
  'use strict';

  globalThis.PE = globalThis.PE || {};

  /** @namespace PE.sites */
  var sites = {};

  /**
   * Site adapter definitions.
   * Order matters for matching hostnames; generic is always the fallback.
   */
  sites.ADAPTERS = [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      hostMatch: /^(?:.*\.)?(?:chatgpt\.com|chat\.openai\.com)$/i,
      inputSelectors: [
        '#prompt-textarea[contenteditable="true"]',
        'div.ProseMirror[contenteditable="true"]',
        '#prompt-textarea',
        'div[id="prompt-textarea"]',
        'div.ProseMirror',
        'textarea'
      ],
      editorType: 'prosemirror',
      preferredWriteStrategy: 'execCommand',
      turnSelectors: [
        '[data-message-author-role]',
        '[data-message-id]',
        'div[class*="conversation-turn"]',
        'article',
        '[data-testid^="conversation-turn-"]'
      ],
      userRoleSelector: '[data-message-author-role="user"], [data-testid="user-message"]',
      assistantRoleSelector: '[data-message-author-role="assistant"], [data-testid="assistant-message"], [data-message-model-slug]'
    },
    {
      id: 'claude',
      name: 'Claude',
      hostMatch: /^(?:.*\.)?claude\.ai$/i,
      inputSelectors: [
        'div.ProseMirror[contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
        'div.ProseMirror',
        '[contenteditable="true"]'
      ],
      editorType: 'prosemirror',
      preferredWriteStrategy: 'execCommand',
      turnSelectors: [
        '[data-testid="user-message"]',
        '[data-testid="assistant-message"]',
        '.font-user-message',
        '.font-claude-message',
        '[data-is-user="true"]',
        'div[data-test-render-count]',
        'div[data-is-streaming]'
      ],
      userRoleSelector: '[data-testid="user-message"], .font-user-message, [data-is-user="true"]',
      assistantRoleSelector: '[data-testid="assistant-message"], .font-claude-message, .standard-markdown'
    },
    {
      id: 'gemini',
      name: 'Gemini',
      hostMatch: /^(?:.*\.)?gemini\.google\.com$/i,
      inputSelectors: [
        'rich-textarea .ql-editor[contenteditable="true"]',
        '.ql-editor[contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
        '.ql-editor',
        '[contenteditable="true"]'
      ],
      editorType: 'quill',
      preferredWriteStrategy: 'execCommand',
      turnSelectors: [
        'user-query',
        'model-response',
        '.user-query-container',
        '.response-container',
        '[data-sender="user"]',
        '[data-sender="model"]',
        '.model-response-text'
      ],
      userRoleSelector: 'user-query, .user-query-container, .query-text, [data-sender="user"]',
      assistantRoleSelector: 'model-response, .response-container, .model-response-text, [data-sender="model"]'
    },
    {
      id: 'generic',
      name: 'Generic',
      hostMatch: null,
      inputSelectors: [
        'textarea',
        '[contenteditable="true"]',
        'input[type="text"]',
        'input:not([type])'
      ],
      editorType: 'auto',
      preferredWriteStrategy: 'auto',
      turnSelectors: [
        '[data-message-author-role]',
        '[data-message-id]',
        '[data-role="user"]',
        '[data-role="assistant"]',
        '[role="log"] article',
        '[role="feed"] article',
        '.chat-history .message',
        '.messages .message',
        'article'
      ],
      userRoleSelector: '[data-message-author-role="user"], [data-role="user"], .user-message',
      assistantRoleSelector: '[data-message-author-role="assistant"], [data-role="assistant"], .assistant-message, .bot-message'
    }
  ];

  /**
   * Resolve the appropriate site adapter for a given location or URL.
   * @param {Location|URL|Object} [loc] - Object with a hostname property (defaults to window.location)
   * @returns {Object} Site adapter configuration
   */
  sites.forLocation = function (loc) {
    var hostname = '';
    if (loc && typeof loc.hostname === 'string') {
      hostname = loc.hostname;
    } else if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      hostname = window.location.hostname;
    }

    for (var i = 0; i < sites.ADAPTERS.length; i++) {
      var adapter = sites.ADAPTERS[i];
      if (adapter.hostMatch && adapter.hostMatch.test(hostname)) {
        return adapter;
      }
    }

    // Return generic adapter if no site-specific match
    return sites.ADAPTERS[sites.ADAPTERS.length - 1];
  };

  globalThis.PE.sites = sites;

}());
