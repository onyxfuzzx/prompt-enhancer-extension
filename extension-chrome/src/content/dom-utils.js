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

  globalThis.PE.dom = dom;

}());
