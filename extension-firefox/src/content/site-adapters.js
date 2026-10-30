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
      assistantRoleSelector: '[data-message-author-role="assistant"], [data-testid="assistant-message"], [data-message-model-slug]',
      attachmentSelectors: [
        '[data-testid*="attachment"]',
        '[data-testid*="file-thumbnail"]',
        '[data-testid*="file"]',
        '[class*="attachment"]',
        '[class*="file-item"]',
        'button[aria-label*="Remove"]',
        '.text-token-text-primary'
      ]
    },
    {
      id: 'claude',
      name: 'Claude',
      hostMatch: /^(?:.*\.)?(?:claude\.ai|claude\.com)$/i,
      inputSelectors: [
        'div.ProseMirror[contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
        '[data-testid="chat-input"]',
        '[data-testid="composer-input"]',
        '[data-testid*="input"][contenteditable="true"]',
        'div.ProseMirror',
        'textarea',
        '[contenteditable="true"]',
        'input[type="text"]'
      ],
      editorType: 'prosemirror',
      preferredWriteStrategy: 'execCommand',
      turnSelectors: [
        '[data-testid="user-message"]',
        '[data-testid="assistant-message"]',
        '[data-testid*="user-message"]',
        '[data-testid*="assistant-message"]',
        '[data-testid="chat-message-user"]',
        '[data-testid="chat-message-assistant"]',
        '[data-testid="human-turn"]',
        '[data-testid="claude-turn"]',
        '.font-user-message',
        '.font-claude-message',
        '[data-is-user="true"]',
        'div[data-test-render-count]',
        'div[data-is-streaming]',
        'div[class*="UserMessage"]',
        'div[class*="ClaudeMessage"]',
        'div[class*="user-message"]',
        'div[class*="assistant-message"]',
        'div[class*="HumanTurn"]',
        'div[class*="ClaudeTurn"]',
        'div[class*="ChatMessage"]',
        'div[class*="chat-turn"]',
        'div[class*="conversation-turn"]',
        'article'
      ],
      userRoleSelector: '[data-testid="user-message"], [data-testid*="user-message"], [data-testid="chat-message-user"], [data-testid="human-turn"], .font-user-message, [data-is-user="true"], [data-message-author-role="user"], [data-role="user"], div[class*="UserMessage"], div[class*="user-message"], div[class*="HumanTurn"]',
      assistantRoleSelector: '[data-testid="assistant-message"], [data-testid*="assistant-message"], [data-testid="chat-message-assistant"], [data-testid="claude-turn"], .font-claude-message, .standard-markdown, [data-message-author-role="assistant"], [data-role="assistant"], div[class*="ClaudeMessage"], div[class*="assistant-message"], div[class*="ClaudeTurn"]',
      attachmentSelectors: [
        '[data-testid="file-thumbnail"]',
        '[data-testid*="file"]',
        '[aria-label*="Remove file"]',
        'div[class*="file-thumbnail"]',
        'div[class*="file-preview"]'
      ]
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
      assistantRoleSelector: 'model-response, .response-container, .model-response-text, [data-sender="model"]',
      attachmentSelectors: [
        'uploader-file-card',
        '[data-test-id*="file"]',
        '[data-test-id*="attachment"]',
        '.file-preview',
        '.attachment-chip',
        'img[alt]'
      ]
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      hostMatch: /^(?:.*\.)?perplexity\.ai$/i,
      inputSelectors: [
        'textarea[placeholder]',
        'textarea',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"]'
      ],
      editorType: 'auto',
      preferredWriteStrategy: 'auto',
      turnSelectors: [
        '[data-testid="user-message"]',
        '[data-testid="assistant-message"]',
        '.prose',
        'article'
      ],
      userRoleSelector: '[data-testid="user-message"], .user-message',
      assistantRoleSelector: '[data-testid="assistant-message"], .prose, .assistant-message',
      attachmentSelectors: [
        '[data-testid*="file"]',
        '.file-attachment',
        '[class*="attachment"]',
        'button[aria-label*="Remove"]'
      ]
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      hostMatch: /^(?:.*\.)?chat\.deepseek\.com$/i,
      inputSelectors: [
        'textarea',
        '[contenteditable="true"]',
        '#chat-input'
      ],
      editorType: 'auto',
      preferredWriteStrategy: 'auto',
      turnSelectors: [
        '.ds-markdown',
        '[class*="message"]',
        'article'
      ],
      userRoleSelector: '[class*="user-message"], [data-role="user"]',
      assistantRoleSelector: '.ds-markdown, [class*="assistant-message"], [data-role="assistant"]',
      attachmentSelectors: [
        '[class*="file-item"]',
        '[class*="attachment"]',
        '[class*="upload-item"]'
      ]
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
      assistantRoleSelector: '[data-message-author-role="assistant"], [data-role="assistant"], .assistant-message, .bot-message',
      attachmentSelectors: [
        'input[type="file"]',
        '[class*="attachment"]',
        '[class*="file-pill"]',
        '[class*="file-chip"]',
        '[class*="file-preview"]',
        '[data-testid*="attachment"]',
        '[data-testid*="file"]'
      ]
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
