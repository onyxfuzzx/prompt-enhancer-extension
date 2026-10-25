// dom-utils.js — Prompt Enhancer
// DOM detection, text extraction, write strategy chain, and verification.
// Must be loaded after site-adapters.js in the content script load order.

/* global globalThis */

(function () {
  'use strict';

  globalThis.PE = globalThis.PE || {};

  /** @namespace PE.dom */
  var dom = {};

  var lastFocusedTarget = null;

  /**
   * Check if a DOM node is an editable element.
   * @param {Element|Node} el
   * @returns {boolean}
   */
  dom.isEditable = function (el) {
    if (!el || el.nodeType !== 1) {
      return false;
    }

    if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') {
      return false;
    }

    var tag = el.tagName.toUpperCase();
    if (tag === 'TEXTAREA') {
      return true;
    }

    if (tag === 'INPUT') {
      var type = (el.type || 'text').toLowerCase();
      return type === 'text' || type === 'search' || type === 'email' || type === 'url' || type === '';
    }

    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') {
      return true;
    }

    return false;
  };

  /**
   * Get the root editor element (e.g. #prompt-textarea instead of an inner <p> or <span>).
   * @param {Element} el
   * @returns {Element|null}
   */
  dom.getEditorRoot = function (el) {
    if (!el || !dom.isEditable(el)) {
      return null;
    }

    var tag = el.tagName.toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      return el;
    }

    // Traverse upwards while parent is also contenteditable
    var curr = el;
    while (curr.parentElement && curr.parentElement.isContentEditable) {
      curr = curr.parentElement;
    }
    return curr;
  };

  /**
   * Check if an element is visible in the viewport and interactable.
   * @param {Element} el
   * @returns {boolean}
   */
  dom.isVisible = function (el) {
    if (!el || !el.isConnected) {
      return false;
    }

    if (el.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    if (el.disabled || el.readOnly) {
      return false;
    }

    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    try {
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
    } catch (e) {
      // In non-window contexts or environments without getComputedStyle
    }

    return true;
  };

  /**
   * Track the last focused editable element.
   * @param {Element} el
   */
  dom.setLastFocused = function (el) {
    var root = dom.getEditorRoot(el);
    if (root && root.isConnected) {
      lastFocusedTarget = root;
    }
  };

  /**
   * Retrieve the last focused editable element if still connected.
   * @returns {Element|null}
   */
  dom.getLastFocused = function () {
    if (lastFocusedTarget && lastFocusedTarget.isConnected && dom.isEditable(lastFocusedTarget)) {
      return lastFocusedTarget;
    }
    lastFocusedTarget = null;
    return null;
  };

  /**
   * Target resolution algorithm (Section 7.2).
   * Priority:
   * 1. Last-focused editable (tracked by focusin)
   * 2. document.activeElement if editable
   * 3. First visible match from site adapter's inputSelectors
   * @param {Object} [adapter] - Site adapter configuration from PE.sites
   * @returns {Element|null}
   */
  dom.findTarget = function (adapter) {
    // 1. Last-focused editable
    var last = dom.getLastFocused();
    if (last && dom.isVisible(last)) {
      return last;
    }

    // 2. document.activeElement if editable
    var active = document.activeElement;
    // Check if activeElement has a shadowRoot containing an active element
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    if (active && dom.isEditable(active) && dom.isVisible(active)) {
      var activeRoot = dom.getEditorRoot(active);
      if (activeRoot && dom.isVisible(activeRoot)) {
        return activeRoot;
      }
    }

    // 3. First visible match from site adapter's selectors
    var currentAdapter = adapter || (globalThis.PE.sites && globalThis.PE.sites.forLocation ? globalThis.PE.sites.forLocation(window.location) : null);
    if (currentAdapter && Array.isArray(currentAdapter.inputSelectors)) {
      for (var i = 0; i < currentAdapter.inputSelectors.length; i++) {
        var sel = currentAdapter.inputSelectors[i];
        try {
          var candidates = document.querySelectorAll(sel);
          for (var j = 0; j < candidates.length; j++) {
            var el = candidates[j];
            if (dom.isEditable(el) && dom.isVisible(el)) {
              return dom.getEditorRoot(el) || el;
            }
          }
        } catch (e) {
          // Selector query error safe catch
        }
      }
    }

    return null;
  };

  /**
   * Read and normalise text from an editable element (Section 7.3).
   * @param {Element} el
   * @returns {string}
   */
  dom.readText = function (el) {
    if (!el) {
      return '';
    }

    var tag = el.tagName.toUpperCase();
    var text = '';

    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      text = el.value || '';
    } else {
      // Contenteditable: innerText preserves line breaks from <p> and <br>
      text = (typeof el.innerText === 'string' && el.innerText.length > 0)
        ? el.innerText
        : (el.textContent || '');
    }

    // Normalisation:
    // 1. \r\n and \r -> \n
    text = text.replace(/\r\n|\r/g, '\n');
    // 2. Collapse 3+ blank lines to 2
    text = text.replace(/\n{3,}/g, '\n\n');
    // 3. Remove zero-width characters (\u200B, \u200C, \u200D, \uFEFF)
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
    // 4. Convert non-breaking spaces (\u00A0) to standard spaces
    text = text.replace(/\u00A0/g, ' ');
    // 5. Trim leading/trailing whitespace
    return text.trim();
  };

  /**
   * Select all text content inside an editable element.
   * Does NOT use document.execCommand('selectAll') to avoid selecting the whole page.
   * @param {Element} el
   */
  dom.selectAllIn = function (el) {
    if (!el) { return; }
    el.focus();

    var tag = el.tagName.toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      if (typeof el.select === 'function') {
        el.select();
      } else if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(0, (el.value || '').length);
      }
      return;
    }

    // Contenteditable
    if (window.getSelection && document.createRange) {
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  /**
   * Position the caret at the end of the text in an editable element.
   * @param {Element} el
   */
  dom.setCaretAtEnd = function (el) {
    if (!el) { return; }
    el.focus();

    var tag = el.tagName.toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      var len = (el.value || '').length;
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(len, len);
      }
      return;
    }

    // Contenteditable
    if (window.getSelection && document.createRange) {
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); // collapse to end
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  /**
   * Helper to normalise a string for verification comparison.
   * Ignores minor whitespace differences between editors.
   * @param {string} str
   * @returns {string}
   */
  function normalizeForCompare(str) {
    return (str || '')
      .replace(/\r\n|\r/g, '\n')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Verify that the element's current text matches expectedText.
   * @param {Element} el
   * @param {string} expectedText
   * @returns {boolean}
   */
  dom.verify = function (el, expectedText) {
    var actual = dom.readText(el);
    return normalizeForCompare(actual) === normalizeForCompare(expectedText);
  };

  // ---------------------------------------------------------------------------
  // Write Strategies (Exposed individually for testing)
  // ---------------------------------------------------------------------------

  /**
   * Strategy 1: execCommand('insertText')
   * Best for ProseMirror (ChatGPT, Claude) and Quill (Gemini), as well as textareas.
   * Triggers real beforeinput/input events and preserves undo history.
   * @param {Element} el
   * @param {string} text
   * @returns {boolean}
   */
  dom.strategyExecCommand = function (el, text) {
    try {
      dom.selectAllIn(el);
      var ok = document.execCommand('insertText', false, text);
      if (ok && dom.verify(el, text)) {
        return true;
      }
    } catch (e) {}
    return false;
  };

  /**
   * Strategy 2: Synthetic paste event with DataTransfer text/plain
   * Handled reliably by ProseMirror and Quill editors when execCommand fails.
   * @param {Element} el
   * @param {string} text
   * @returns {boolean}
   */
  dom.strategySyntheticPaste = function (el, text) {
    try {
      dom.selectAllIn(el);
      var dt = null;
      try {
        dt = new DataTransfer();
        dt.setData('text/plain', text);
      } catch (dtErr) {
        // Fallback for environments where DataTransfer constructor isn't available
      }

      var pasteEvt = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });

      el.dispatchEvent(pasteEvt);
      if (dom.verify(el, text)) {
        return true;
      }
    } catch (e) {}
    return false;
  };

  /**
   * Strategy 3: Native value setter + synthetic input/change events
   * For <textarea> and <input> (bypasses React's internal value tracker).
   * @param {Element} el
   * @param {string} text
   * @returns {boolean}
   */
  dom.strategyNativeValue = function (el, text) {
    try {
      var tag = el.tagName.toUpperCase();
      if (tag !== 'TEXTAREA' && tag !== 'INPUT') {
        return false;
      }

      var proto = (tag === 'TEXTAREA')
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

      var descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, text);
      } else {
        el.value = text;
      }

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      if (dom.verify(el, text)) {
        return true;
      }
    } catch (e) {}
    return false;
  };

  /**
   * Strategy 4: Direct DOM write (contenteditable only)
   * Splits into <p> paragraphs setting textContent (never innerHTML to prevent XSS).
   * @param {Element} el
   * @param {string} text
   * @returns {boolean}
   */
  dom.strategyDirectDom = function (el, text) {
    try {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        return false;
      }

      el.textContent = '';
      var lines = text.split('\n');
      if (lines.length === 0) {
        lines = [''];
      }

      lines.forEach(function (line) {
        var p = document.createElement('p');
        p.textContent = line.length > 0 ? line : '\u00A0';
        el.appendChild(p);
      });

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      if (dom.verify(el, text)) {
        return true;
      }
    } catch (e) {}
    return false;
  };

  /**
   * Strategy 5: Clipboard fallback
   * Copies text to clipboard if automatic insertion fails.
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  dom.strategyClipboardFallback = function (text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return false;
      });
    }
    return Promise.resolve(false);
  };

  /**
   * Strategy Chain Runner (Section 7.4).
   * Attempts strategies in order and verifies after each.
   * @param {Element} el - Target editable element
   * @param {string} text - Enhanced replacement text
   * @returns {Object} { ok: boolean, strategy: string, originalText: string, copied?: boolean }
   */
  dom.writeText = function (el, text) {
    if (!el) {
      return { ok: false, strategy: 'none', originalText: '' };
    }

    var originalText = dom.readText(el);
    var isTextareaOrInput = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
    var successStrategy = null;

    if (isTextareaOrInput) {
      // For textarea / input: try execCommand -> native value setter -> synthetic paste
      if (dom.strategyExecCommand(el, text)) {
        successStrategy = 'execCommand';
      } else if (dom.strategyNativeValue(el, text)) {
        successStrategy = 'nativeValue';
      } else if (dom.strategySyntheticPaste(el, text)) {
        successStrategy = 'syntheticPaste';
      }
    } else {
      // For contenteditable: try execCommand -> synthetic paste -> direct DOM
      if (dom.strategyExecCommand(el, text)) {
        successStrategy = 'execCommand';
      } else if (dom.strategySyntheticPaste(el, text)) {
        successStrategy = 'syntheticPaste';
      } else if (dom.strategyDirectDom(el, text)) {
        successStrategy = 'directDom';
      }
    }

    if (successStrategy) {
      dom.setCaretAtEnd(el);
      try {
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } catch (e) {}

      return {
        ok: true,
        strategy: successStrategy,
        originalText: originalText
      };
    }

    // All in-DOM write strategies failed: attempt clipboard fallback
    var fallbackResult = {
      ok: false,
      strategy: 'clipboardFallback',
      originalText: originalText,
      copied: false
    };

    dom.strategyClipboardFallback(text).then(function (copied) {
      fallbackResult.copied = copied;
    });

    return fallbackResult;
  };

  /**
   * Helper: check if element matches CSS selector across standard and vendor prefixes.
   * @param {Element} el
   * @param {string} selector
   * @returns {boolean}
   */
  dom.matches = function (el, selector) {
    if (!el || el.nodeType !== 1 || !selector) return false;
    var fn = el.matches || el.webkitMatchesSelector || el.mozMatchesSelector || el.msMatchesSelector;
    if (fn) {
      try {
        return fn.call(el, selector);
      } catch (e) {
        return false;
      }
    }
    return false;
  };

  /**
   * Extract clean text content from a message node, stripping buttons,
   * toolbars, icon SVGs, and interactive UI artifacts.
   *
   * @param {Element} node
   * @returns {string}
   */
  dom.extractCleanText = function (node) {
    if (!node) return '';
    try {
      // 1. If the node or an inner content container is connected in the DOM,
      // read innerText directly from the live tree to preserve accurate whitespace and line breaks.
      var contentNode = node;
      if (node.querySelector) {
        var inner = node.querySelector('.markdown, .prose, .whitespace-pre-wrap, .query-text, .model-response-text, [data-message-content]');
        if (inner) {
          contentNode = inner;
        }
      }

      // 2. Clone to safely remove noisy interactive buttons and SVGs
      var clone = contentNode.cloneNode(true);
      var noiseSelectors = [
        'button',
        'svg',
        'nav',
        'footer',
        'script',
        'style',
        'noscript',
        '[class*="toolbar"]',
        '[data-testid*="copy"]',
        '[data-testid*="thumb"]',
        '[data-testid*="feedback"]'
      ];

      for (var i = 0; i < noiseSelectors.length; i++) {
        var noise = clone.querySelectorAll(noiseSelectors[i]);
        for (var j = 0; j < noise.length; j++) {
          if (noise[j].parentNode) {
            noise[j].parentNode.removeChild(noise[j]);
          }
        }
      }

      // 3. Extract text from clone (or fallback to live node text)
      var text = clone.innerText || clone.textContent || '';
      if (!text || text.trim().length === 0) {
        text = contentNode.innerText || contentNode.textContent || '';
      }

      // 4. Strip common leaked UI button labels
      text = text.replace(/\b(?:Copy code|Copy|Retry|Regenerate|Share|Listen)\b/gi, '');

      return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
      return (node.textContent || '').trim();
    }
  };

  /**
   * Extract conversation context (turns of user and assistant messages) from the current page.
   * Supports ChatGPT, Claude, Gemini, and generic chat layouts.
   *
   * @param {Object} [adapter] Current site adapter
   * @param {Element} [currentTarget] Active editor element (to exclude from message history)
   * @param {Object} [options] { maxTurns, maxChars }
   * @returns {Array<{ role: string, text: string }>} Chronological list of message turns
   */
  dom.extractConversationContext = function (adapter, currentTarget, options) {
    options = options || {};
    var maxTurns = options.maxTurns || (PE.C && PE.C.DEFAULTS && PE.C.DEFAULTS.maxContextTurns) || 6;
    var maxChars = options.maxChars || (PE.C && PE.C.LIMITS && PE.C.LIMITS.MAX_CONTEXT_CHARS) || 8000;

    if (!adapter && PE.sites && typeof PE.sites.forLocation === 'function') {
      adapter = PE.sites.forLocation();
    }
    adapter = adapter || {};

    var turns = [];
    try {
      if (typeof document === 'undefined') return [];

      var selectors = adapter.turnSelectors || [
        '[data-message-author-role]',
        '[data-message-id]',
        'article',
        'user-query',
        'model-response',
        '.font-user-message',
        '.font-claude-message'
      ];

      var foundElements = [];
      for (var s = 0; s < selectors.length; s++) {
        var matches = document.querySelectorAll(selectors[s]);
        if (matches && matches.length > 0) {
          for (var m = 0; m < matches.length; m++) {
            var el = matches[m];
            if (currentTarget && (el === currentTarget || el.contains(currentTarget) || currentTarget.contains(el))) {
              continue;
            }
            if (foundElements.indexOf(el) === -1) {
              foundElements.push(el);
            }
          }
        }
      }

      if (foundElements.length === 0) {
        return [];
      }

      // Sort elements by document order
      foundElements.sort(function (a, b) {
        if (a === b) return 0;
        if (typeof a.compareDocumentPosition === 'function') {
          var pos = a.compareDocumentPosition(b);
          return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        }
        return 0;
      });

      // Filter: if both a container (e.g. article or .conversation-turn) and an inner [data-message-author-role]
      // are in foundElements, select the inner message element (most specific)
      var uniqueElements = [];
      for (var f = 0; f < foundElements.length; f++) {
        var currentEl = foundElements[f];
        var isAncestorOfAnother = false;
        for (var o = 0; o < foundElements.length; o++) {
          if (f !== o && currentEl.contains(foundElements[o])) {
            isAncestorOfAnother = true;
            break;
          }
        }
        if (!isAncestorOfAnother) {
          uniqueElements.push(currentEl);
        }
      }
      if (uniqueElements.length === 0) {
        uniqueElements = foundElements;
      }

      for (var i = 0; i < uniqueElements.length; i++) {
        var turnEl = uniqueElements[i];

        // Determine role: 'user' or 'assistant'
        var role = 'assistant';
        var roleAttr = turnEl.getAttribute('data-message-author-role') ||
          (turnEl.closest && turnEl.closest('[data-message-author-role]') && turnEl.closest('[data-message-author-role]').getAttribute('data-message-author-role')) ||
          (turnEl.querySelector && turnEl.querySelector('[data-message-author-role]') && turnEl.querySelector('[data-message-author-role]').getAttribute('data-message-author-role'));

        if (roleAttr) {
          role = (roleAttr.toLowerCase() === 'user') ? 'user' : 'assistant';
        } else if (turnEl.getAttribute('data-is-user') === 'true' || turnEl.getAttribute('data-sender') === 'user') {
          role = 'user';
        } else if (turnEl.getAttribute('data-sender') === 'model' || turnEl.getAttribute('data-sender') === 'assistant') {
          role = 'assistant';
        } else if (adapter.userRoleSelector && (dom.matches(turnEl, adapter.userRoleSelector) || (turnEl.querySelector && turnEl.querySelector(adapter.userRoleSelector)))) {
          role = 'user';
        } else if (adapter.assistantRoleSelector && (dom.matches(turnEl, adapter.assistantRoleSelector) || (turnEl.querySelector && turnEl.querySelector(adapter.assistantRoleSelector)))) {
          role = 'assistant';
        } else {
          var tagLower = (turnEl.tagName || '').toLowerCase();
          var classStr = (turnEl.className && typeof turnEl.className === 'string') ? turnEl.className.toLowerCase() : '';
          if (tagLower === 'user-query' || classStr.indexOf('user') !== -1 || (turnEl.querySelector && turnEl.querySelector('.whitespace-pre-wrap'))) {
            role = 'user';
          } else if (tagLower === 'model-response' || classStr.indexOf('assistant') !== -1 || classStr.indexOf('claude') !== -1 || classStr.indexOf('bot') !== -1 || (turnEl.querySelector && turnEl.querySelector('.markdown, .prose'))) {
            role = 'assistant';
          }
        }

        // Clean extracted text
        var cleanText = dom.extractCleanText(turnEl);
        if (!cleanText || cleanText.length < 2) {
          continue;
        }

        turns.push({
          role: role,
          text: cleanText
        });
      }

      // Limit to most recent turns
      if (turns.length > maxTurns) {
        turns = turns.slice(turns.length - maxTurns);
      }

      // Truncate total text length to stay within character limits
      var totalChars = 0;
      var trimmedTurns = [];
      for (var t = turns.length - 1; t >= 0; t--) {
        var turnText = turns[t].text;
        if (totalChars + turnText.length > maxChars) {
          var remaining = maxChars - totalChars;
          if (remaining > 100) {
            trimmedTurns.unshift({
              role: turns[t].role,
              text: '... ' + turnText.slice(-remaining)
            });
          }
          break;
        } else {
          trimmedTurns.unshift(turns[t]);
          totalChars += turnText.length;
        }
      }
      turns = trimmedTurns;

    } catch (e) {
      if (PE.C && PE.C.DEBUG) {
        console.warn('[PE] Failed to extract conversation context:', e);
      }
    }

    return turns;
  };

  /**
   * Helper to categorize files by extension.
   * @param {string} filename
   * @returns {string}
   */
  function detectFileCategory(filename) {
    if (!filename || typeof filename !== 'string') return 'Document';
    var ext = '';
    var match = filename.match(/\.([a-zA-Z0-9]{1,8})$/);
    if (match) {
      ext = match[1].toLowerCase();
    }
    if (/^(csv|tsv|xlsx?|parquet|feather|ods)$/.test(ext)) return 'Spreadsheet / Data';
    if (/^(png|jpe?g|webp|gif|svg|bmp|tiff|avif)$/.test(ext)) return 'Image';
    if (/^(pdf|docx?|txt|rtf|odt|epub|pages)$/.test(ext)) return 'Document';
    if (/^(py|js|ts|jsx|tsx|json|sql|html|css|cpp|c|java|go|rs|rb|php|sh|yaml|yml|xml|toml)$/.test(ext)) return 'Code / Data';
    if (/^(zip|tar|gz|7z|rar)$/.test(ext)) return 'Archive';
    return 'File';
  }

  /**
   * Resolve the visible outer input container (pill / card) that wraps the text input
   * and its associated toolbar buttons (attach, mic, send), excluding disclaimer footers
   * and chat history containers.
   *
   * @param {Element} targetEl
   * @returns {Element}
   */
  dom.findOuterInputContainer = function (targetEl) {
    if (!targetEl || !targetEl.parentElement) return targetEl;

    try {
      var host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
      var winW = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1920;
      var winH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1080;
      var targetRect = targetEl.getBoundingClientRect();
      var maxAllowedH = Math.min(320, (targetRect.height > 0 ? targetRect.height + 90 : 220));

      function hasDisclaimer(el) {
        if (!el) return false;
        var txt = (el.textContent || '').toLowerCase();
        if (
          txt.includes('can make mistakes') ||
          txt.includes('double-check responses') ||
          txt.includes('display inaccurate info') ||
          txt.includes('verify important info') ||
          txt.includes('check important info')
        ) {
          return true;
        }
        if (el.querySelector && el.querySelector('[class*="disclaimer"], [class*="footer"], .text-xs')) {
          var dChild = el.querySelector('[class*="disclaimer"], [class*="footer"], .text-xs');
          var dTxt = (dChild.textContent || '').toLowerCase();
          if (dTxt.includes('mistake') || dTxt.includes('inaccurate') || dTxt.includes('verify') || dTxt.includes('claude is ai') || dTxt.includes('chatgpt can')) {
            return true;
          }
        }
        return false;
      }

      function isValidCard(el, maxH, maxW) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        var r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        if (r.height > (maxH || maxAllowedH)) return false;
        if (r.width > (maxW || (winW - 20))) return false;
        if (hasDisclaimer(el)) return false;
        if (el.matches && el.matches('body, html, main, section, [role="log"], [role="feed"], .conversation-container, #chat-history')) {
          return false;
        }
        return true;
      }

      function hasPillRadius(el) {
        if (!el || typeof window === 'undefined' || !window.getComputedStyle) return false;
        var cs = window.getComputedStyle(el);
        var r = parseFloat(cs.borderRadius) || parseFloat(cs.borderTopLeftRadius) || 0;
        return r >= 16;
      }

      function hasCardStyle(el) {
        if (!el || typeof window === 'undefined' || !window.getComputedStyle) return false;
        var cs = window.getComputedStyle(el);
        var r = parseFloat(cs.borderRadius) || parseFloat(cs.borderTopLeftRadius) || 0;
        var hasBg = cs.backgroundColor && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
        var hasBorder = (parseFloat(cs.borderWidth) || 0) > 0 && cs.borderStyle !== 'none';
        var hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
        return (r >= 12) && (hasBg || hasBorder || hasShadow);
      }

      // 1. Google Gemini (gemini.google.com)
      if (/gemini\.google\.com/i.test(host)) {
        var richText = targetEl.closest('rich-textarea') || targetEl;

        var inputArea = richText.closest('.input-area, [class*="input-area"]');
        if (inputArea && isValidCard(inputArea, maxAllowedH, winW - 30)) {
          if (!inputArea.classList.contains('conversation-container') && !inputArea.classList.contains('chat-history') && !inputArea.classList.contains('chat-app')) {
            var btns = inputArea.querySelectorAll('button, [role="button"]');
            if (btns.length > 0) {
              return inputArea;
            }
          }
        }

        var currGemini = richText.parentElement;
        var depthGemini = 0;
        while (currGemini && currGemini !== document.body && depthGemini < 5) {
          depthGemini++;
          if (hasDisclaimer(currGemini)) break;
          if (currGemini.classList && (
            currGemini.classList.contains('conversation-container') ||
            currGemini.classList.contains('bottom-container') ||
            currGemini.classList.contains('chat-history') ||
            currGemini.classList.contains('chat-app')
          )) {
            break;
          }
          if (isValidCard(currGemini, maxAllowedH, winW - 30)) {
            var gBtns = currGemini.querySelectorAll('button, [role="button"]');
            var gRadius = hasPillRadius(currGemini);
            if (gRadius && gBtns.length > 0) {
              return currGemini;
            }
          }
          currGemini = currGemini.parentElement;
        }

        if (richText.parentElement && isValidCard(richText.parentElement, maxAllowedH, winW - 30)) {
          return richText.parentElement;
        }
      }

      // 2. Anthropic Claude (claude.ai)
      if (/claude\.ai/i.test(host)) {
        var fieldset = targetEl.closest('fieldset');
        if (fieldset && isValidCard(fieldset, maxAllowedH, winW - 24) && fieldset.querySelectorAll('button, [role="button"]').length > 0) {
          return fieldset;
        }

        var currClaude = targetEl.parentElement;
        var depthClaude = 0;
        var bestClaudeCard = null;

        while (currClaude && currClaude !== document.body && depthClaude < 6) {
          depthClaude++;
          if (hasDisclaimer(currClaude)) break;
          if (currClaude.tagName && currClaude.tagName.toLowerCase() === 'form') break;

          var cRect = currClaude.getBoundingClientRect();
          if (cRect.width > 0 && cRect.height > 0 && cRect.height <= maxAllowedH) {
            var cs = window.getComputedStyle(currClaude);
            var cBorder = parseFloat(cs.borderWidth) || 0;
            var cRadius = parseFloat(cs.borderRadius) || parseFloat(cs.borderTopLeftRadius) || 0;
            var cBtns = currClaude.querySelectorAll('button, [role="button"]');

            if ((cBorder > 0 || cRadius >= 14 || (currClaude.className && currClaude.className.includes('rounded-'))) && cBtns.length > 0) {
              bestClaudeCard = currClaude;
              var hasSend = false;
              for (var bi = 0; bi < cBtns.length; bi++) {
                var btnAria = (cBtns[bi].getAttribute('aria-label') || '').toLowerCase();
                if (btnAria.includes('send') || btnAria.includes('message')) { hasSend = true; break; }
              }
              if (hasSend || cBtns.length >= 2) {
                return currClaude;
              }
            }
          }
          currClaude = currClaude.parentElement;
        }

        if (bestClaudeCard) return bestClaudeCard;
      }

      // 3. OpenAI ChatGPT (chatgpt.com / chat.openai.com)
      if (/chatgpt\.com|chat\.openai\.com/i.test(host)) {
        var composerBg = targetEl.closest('#composer-background, [id*="composer-background"], [class*="bg-token-main-surface"], div[class*="rounded-[2"], div[class*="rounded-3xl"]');
        if (composerBg && isValidCard(composerBg, maxAllowedH, winW - 24)) {
          return composerBg;
        }

        var currGpt = targetEl.parentElement;
        var depthGpt = 0;
        var bestGptCard = null;

        while (currGpt && currGpt !== document.body && depthGpt < 6) {
          depthGpt++;
          if (hasDisclaimer(currGpt)) break;
          if (currGpt.tagName && currGpt.tagName.toLowerCase() === 'form') break;

          var gRect = currGpt.getBoundingClientRect();
          if (gRect.width > 0 && gRect.height > 0 && gRect.height <= maxAllowedH) {
            var gcs = window.getComputedStyle(currGpt);
            var gRadius = parseFloat(gcs.borderRadius) || parseFloat(gcs.borderTopLeftRadius) || 0;
            var gBtns = currGpt.querySelectorAll('button, [role="button"]');

            if (gRadius >= 16 && gBtns.length > 0) {
              bestGptCard = currGpt;
              var hasGptSend = false;
              for (var gi = 0; gi < gBtns.length; gi++) {
                var gTestId = (gBtns[gi].getAttribute('data-testid') || '').toLowerCase();
                var gAria = (gBtns[gi].getAttribute('aria-label') || '').toLowerCase();
                if (gTestId.includes('send') || gAria.includes('send') || gAria.includes('prompt')) {
                  hasGptSend = true;
                  break;
                }
              }
              if (hasGptSend || gBtns.length >= 2) {
                return currGpt;
              }
            }
          }
          currGpt = currGpt.parentElement;
        }

        if (bestGptCard) return bestGptCard;
      }

      // 4. Google AI Studio (aistudio.google.com)
      if (/aistudio\.google\.com/i.test(host)) {
        var aiStudioBox = targetEl.closest('ms-autosize-textarea, ms-prompt-box, .prompt-box');
        if (aiStudioBox && aiStudioBox.parentElement && isValidCard(aiStudioBox.parentElement, maxAllowedH, winW - 30)) {
          return aiStudioBox.parentElement;
        }
      }
    } catch (e) {}

    // 5. Universal Scored Upward Traversal (Fallback for all sites)
    try {
      var targetRect = targetEl.getBoundingClientRect();
      var maxAllowedH = Math.min(320, (targetRect.height > 0 ? targetRect.height + 90 : 220));
      var curr = targetEl.parentElement;
      var depth = 0;
      var bestCandidate = null;
      var bestScore = -1;
      var winWFallback = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1920;
      var winHFallback = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1080;

      while (curr && curr !== document.body && curr !== document.documentElement && depth < 8) {
        depth++;
        var rect = curr.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          curr = curr.parentElement;
          continue;
        }

        if (rect.width > winWFallback - 24) break;
        if (rect.height > maxAllowedH || rect.height > winHFallback * 0.6) break;

        var txt = (curr.textContent || '').toLowerCase();
        if (txt.includes('can make mistakes') || txt.includes('double-check responses') || txt.includes('display inaccurate info')) {
          break;
        }

        if (curr.matches && curr.matches('main, article, section, [role="log"], [role="feed"], [role="main"], form, .conversation-container, #chat-history')) {
          curr = curr.parentElement;
          continue;
        }

        var cs = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(curr) : null;
        var radiusVal = cs ? (parseFloat(cs.borderRadius) || parseFloat(cs.borderTopLeftRadius) || 0) : 0;
        var hasBg = cs && cs.backgroundColor && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
        var hasBorder = cs && (parseFloat(cs.borderWidth) || 0) > 0 && cs.borderStyle !== 'none';
        var hasShadow = cs && cs.boxShadow && cs.boxShadow !== 'none';

        var allBtns = curr.querySelectorAll('button, [role="button"], input[type="submit"]');
        var outsideBtns = 0;
        var hasSendBtn = false;
        for (var i = 0; i < allBtns.length; i++) {
          var b = allBtns[i];
          if (!targetEl.contains(b)) {
            outsideBtns++;
            var aria = (b.getAttribute('aria-label') || '').toLowerCase();
            var testid = (b.getAttribute('data-testid') || '').toLowerCase();
            var btype = (b.getAttribute('type') || '').toLowerCase();
            var bclass = (b.className || '').toString().toLowerCase();
            if (
              btype === 'submit' ||
              aria.includes('send') || aria.includes('submit') || aria.includes('prompt') || aria.includes('post') ||
              testid.includes('send') || testid.includes('submit') ||
              bclass.includes('send') || bclass.includes('submit')
            ) {
              hasSendBtn = true;
            }
          }
        }

        var score = 0;
        if (outsideBtns > 0) score += 50;
        if (hasSendBtn) score += 100;
        if (outsideBtns >= 2) score += 30;
        if (radiusVal >= 16) score += 60;
        else if (radiusVal >= 8) score += 25;
        if (hasBg) score += 20;
        if (hasBorder || hasShadow) score += 15;

        if (rect.height > targetRect.height + 90) {
          score -= 80;
        }

        var enclosesTarget = (rect.width >= targetRect.width - 4) && (rect.height >= targetRect.height - 2);

        if (enclosesTarget && score > bestScore) {
          bestCandidate = curr;
          bestScore = score;
        }

        if (hasSendBtn && radiusVal >= 16 && outsideBtns >= 1 && rect.height <= targetRect.height + 90) {
          bestCandidate = curr;
          break;
        }

        curr = curr.parentElement;
      }

      if (bestCandidate && bestScore >= 50) {
        return bestCandidate;
      }
    } catch (e) {}

    return targetEl;
  };

  /**
   * Extract attached/uploaded files for the current prompt draft.
   * Inspects the active composer container, file inputs, and platform-specific attachment pills.
   *
   * @param {Object} [adapter] Current site adapter
   * @param {Element} [currentTarget] Active editor element
   * @returns {Array<{ name: string, type: string, preview?: string }>}
   */
  dom.extractAttachments = function (adapter, currentTarget) {
    if (typeof document === 'undefined') return [];

    if (!adapter && PE.sites && typeof PE.sites.forLocation === 'function') {
      adapter = PE.sites.forLocation();
    }
    adapter = adapter || {};

    var attachments = [];
    var seenNames = {};

    function addAttachment(name, preview) {
      if (!name || typeof name !== 'string') return;
      var cleanName = name.trim();
      // Clean up common prefix junk like "Remove ", "Delete ", "File: "
      cleanName = cleanName.replace(/^(?:remove|delete|dismiss|file|attachment)[:\s]+/i, '').trim();
      if (!cleanName || cleanName.length < 2 || cleanName.length > 120) return;
      // Filter out UI button text like "Upload", "Attach", "Add files"
      if (/^(upload|attach|add files?|drop files?|choose file|browse)$/i.test(cleanName)) return;

      var key = cleanName.toLowerCase();
      if (seenNames[key]) return;
      seenNames[key] = true;

      var category = detectFileCategory(cleanName);
      var item = {
        name: cleanName,
        type: category
      };
      if (preview && typeof preview === 'string' && preview.trim()) {
        item.preview = preview.trim().slice(0, 400);
      }
      attachments.push(item);
    }

    try {
      // 1. Find composer container / form enclosing currentTarget
      var composer = currentTarget ? dom.findOuterInputContainer(currentTarget) : null;
      if (!composer && currentTarget) {
        composer = currentTarget.closest('form, main, fieldset, [role="region"], div[class*="input"], div[class*="composer"]') || document.body;
      }
      var searchRoot = composer || document.body;

      // 2. Check HTML file inputs in searchRoot
      var fileInputs = searchRoot.querySelectorAll('input[type="file"]');
      for (var fi = 0; fi < fileInputs.length; fi++) {
        var input = fileInputs[fi];
        if (input.files && input.files.length > 0) {
          for (var f = 0; f < input.files.length; f++) {
            var file = input.files[f];
            addAttachment(file.name);
          }
        }
      }

      // 3. Check attachment selectors
      var selectors = adapter.attachmentSelectors || [
        '[data-testid*="attachment"]',
        '[data-testid*="file"]',
        '[class*="attachment"]',
        '[class*="file-item"]',
        '[class*="file-pill"]',
        '[class*="file-chip"]',
        'button[aria-label*="Remove"]',
        'uploader-file-card'
      ];

      for (var s = 0; s < selectors.length; s++) {
        var matches = searchRoot.querySelectorAll(selectors[s]);
        for (var m = 0; m < matches.length; m++) {
          var el = matches[m];
          // Exclude the current text input itself
          if (currentTarget && (el === currentTarget || el.contains(currentTarget))) {
            continue;
          }

          // Try aria-label / title first (e.g. "Remove dataset.csv")
          var ariaLabel = el.getAttribute('aria-label') || el.getAttribute('title') || '';
          if (ariaLabel && /\.[a-zA-Z0-9]{2,5}\b/.test(ariaLabel)) {
            var labelMatch = ariaLabel.match(/([\w\s.-]+\.[a-zA-Z0-9]{1,8})/);
            if (labelMatch) {
              addAttachment(labelMatch[1]);
              continue;
            }
          }

          // Try image alt attribute (for image uploads)
          var img = el.tagName === 'IMG' ? el : el.querySelector('img');
          if (img) {
            var alt = img.getAttribute('alt') || '';
            if (alt && !/^(avatar|user|assistant|icon|logo|gemini|chatgpt|claude)$/i.test(alt)) {
              addAttachment(alt);
            }
          }

          // Try inner text / filename span
          var text = (el.textContent || '').trim();
          if (text) {
            var fileMatch = text.match(/([\w\s.-]+\.[a-zA-Z0-9]{1,8})/);
            if (fileMatch) {
              addAttachment(fileMatch[1]);
            } else if (text.length < 50 && (el.getAttribute('data-testid') || '').indexOf('file') !== -1) {
              addAttachment(text);
            }
          }
        }
      }

    } catch (e) {
      if (PE.C && PE.C.DEBUG) {
        console.warn('[PE] Failed to extract attachments:', e);
      }
    }

    return attachments;
  };

  globalThis.PE.dom = dom;

}());
