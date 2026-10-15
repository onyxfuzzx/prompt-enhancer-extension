// content.js — Prompt Enhancer
// Main content script: double-injection guard, focus tracking,
// message routing (PING_CONTENT, START_ENHANCE), and live enhancement orchestration.
// Phase 4: Replaces Phase 3 mock with live service worker ENHANCE_PROMPT messaging.

/* global globalThis, chrome */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Double-Injection Guard (Section 7.6)
  // ---------------------------------------------------------------------------
  if (globalThis.PE && globalThis.PE.__contentLoaded) {
    return;
  }
  globalThis.PE = globalThis.PE || {};
  globalThis.PE.__contentLoaded = true;

  var PE = globalThis.PE;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var isEnhancing = false;
  var isCancelled = false;
  var originalDraftText = '';
  var originalTarget = null;

  // ---------------------------------------------------------------------------
  // Focus Tracking (Capture Phase on Document)
  // ---------------------------------------------------------------------------
  document.addEventListener('focusin', function (event) {
    try {
      var candidate = null;

      // Handle Shadow DOM roots via event.composedPath()
      if (event.composedPath && typeof event.composedPath === 'function') {
        var path = event.composedPath();
        for (var i = 0; i < path.length; i++) {
          if (PE.dom && PE.dom.isEditable(path[i])) {
            candidate = PE.dom.getEditorRoot(path[i]);
            break;
          }
        }
      }

      if (!candidate && event.target && PE.dom && PE.dom.isEditable(event.target)) {
        candidate = PE.dom.getEditorRoot(event.target);
      }

      if (candidate && PE.dom) {
        PE.dom.setLastFocused(candidate);
      }
    } catch (e) {
      // Focus tracking error safe catch
    }
  }, true);

  // ---------------------------------------------------------------------------
  // Helper: Notify Background Service Worker of Status (Toolbar Badge)
  // ---------------------------------------------------------------------------
  function notifyStatus(state) {
    try {
      if (chrome.runtime && chrome.runtime.sendMessage && PE.C && PE.C.MSG) {
        chrome.runtime.sendMessage({
          type: PE.C.MSG.ENHANCE_STATUS,
          state: state
        }, function () {
          // Swallow unchecked runtime.lastError when SW is not listening
          if (chrome.runtime.lastError) {}
        });
      }
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // Helper: Write Text into Target & Handle Fallbacks / Undo
  // ---------------------------------------------------------------------------
  function doInsertEnhancedText(target, text, undoText, customSuccessMsg) {
    var writeResult = PE.dom.writeText(target, text);
    if (writeResult && writeResult.ok) {
      notifyStatus('done');
      PE.ui.showSuccess({
        targetEl: target,
        message: customSuccessMsg || 'Prompt enhanced ✓',
        onUndo: function () {
          PE.dom.writeText(target, undoText);
          PE.ui.hide();
        }
      });
    } else {
      notifyStatus('error');
      var copiedToClipboard = Boolean(writeResult && writeResult.copied);
      if (!copiedToClipboard && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(function () {
          PE.ui.showError({
            targetEl: target,
            message: "Couldn't insert automatically — text copied to clipboard. Press Ctrl+V."
          });
        }).catch(function () {
          PE.ui.showError({
            targetEl: target,
            message: 'Failed to insert text into the editor.'
          });
        });
        return;
      }
      var errorMsg = copiedToClipboard
        ? "Couldn't insert automatically — text copied to clipboard. Press Ctrl+V."
        : 'Failed to insert text into the editor.';
      PE.ui.showError({
        targetEl: target,
        message: errorMsg
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Flow 1: Prompt Enhancement Orchestration
  // ---------------------------------------------------------------------------
  function startEnhancement(sendResponse) {
    if (isEnhancing) {
      if (sendResponse) {
        sendResponse({
          ok: false,
          error: { code: 'BUSY', message: 'An operation is already in progress.' }
        });
      }
      return false;
    }

    var currentAdapter = PE.sites.forLocation(window.location);
    var currentTarget = PE.dom.findTarget(currentAdapter);

    if (!currentTarget) {
      PE.ui.showError({ message: 'Click into the chat box first.' });
      if (sendResponse) {
        sendResponse({
          ok: false,
          error: { code: 'NO_TARGET', message: 'Click into the chat box first.' }
        });
      }
      return false;
    }

    var raw = PE.dom.readText(currentTarget);
    if (!raw || !raw.trim()) {
      PE.ui.showError({ targetEl: currentTarget, message: 'Type a draft prompt first.' });
      if (sendResponse) {
        sendResponse({
          ok: false,
          error: { code: 'INPUT_EMPTY', message: 'Type a draft prompt first.' }
        });
      }
      return false;
    }

    var maxChars = (PE.C.LIMITS && PE.C.LIMITS.MAX_INPUT_CHARS) || 12000;
    if (raw.length > maxChars) {
      PE.ui.showError({
        targetEl: currentTarget,
        message: 'Draft prompt is too long (maximum ' + maxChars + ' characters).'
      });
      if (sendResponse) {
        sendResponse({
          ok: false,
          error: { code: 'INPUT_TOO_LONG', message: 'Draft prompt is too long.' }
        });
      }
      return false;
    }

    if (sendResponse) {
      sendResponse({ ok: true, started: true });
    }

    isEnhancing = true;
    isCancelled = false;
    originalDraftText = raw;
    originalTarget = currentTarget;

    notifyStatus('busy');

    PE.ui.showBusy({
      targetEl: currentTarget,
      mode: 'enhance',
      onCancel: function () {
        isCancelled = true;
        isEnhancing = false;
        PE.ui.hide();
        notifyStatus('done');
      }
    });

    var chatContext = [];
    if (PE.dom && typeof PE.dom.extractConversationContext === 'function') {
      chatContext = PE.dom.extractConversationContext(currentAdapter, currentTarget);
    }

    try {
      chrome.runtime.sendMessage({
        type: PE.C.MSG.ENHANCE_PROMPT,
        text: raw,
        context: chatContext,
        source: 'content'
      }, function (response) {
        var runtimeErr = chrome.runtime.lastError;

        if (isCancelled) {
          isEnhancing = false;
          return;
        }

        if (runtimeErr) {
          isEnhancing = false;
          notifyStatus('error');
          var errMsg = runtimeErr.message || 'Communication error.';
          if (errMsg.indexOf('Extension context invalidated') !== -1) {
            errMsg = 'Prompt Enhancer was updated — please reload this page.';
          }
          PE.ui.showError({ targetEl: currentTarget, message: errMsg });
          return;
        }

        if (!response || !response.ok) {
          isEnhancing = false;
          notifyStatus('error');
          var err = response && response.error;
          var failureMessage = (err && err.message) || 'Enhancement failed.';
          var failureDetail  = (err && err.detail) || '';
          PE.ui.showError({ targetEl: currentTarget, message: failureMessage, detail: failureDetail });
          return;
        }

        var activeTarget = currentTarget;
        if (!activeTarget.isConnected) {
          activeTarget = PE.dom.findTarget(currentAdapter);
        }

        if (!activeTarget) {
          isEnhancing = false;
          notifyStatus('error');
          PE.ui.showError({ message: 'The chat box was disconnected while enhancing.' });
          return;
        }

        var enhancedText = response.enhancedText;
        var currentText = PE.dom.readText(activeTarget);
        if (currentText !== originalDraftText) {
          isEnhancing = false;
          PE.ui.showStaleWarning({
            targetEl: activeTarget,
            message: 'The text changed while enhancing.',
            onInsertAnyway: function () {
              doInsertEnhancedText(activeTarget, enhancedText, currentText);
            },
            onCopy: function () {
              if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(enhancedText).then(function () {
                  notifyStatus('done');
                  PE.ui.showSuccess({
                    targetEl: activeTarget,
                    message: 'Enhanced prompt copied to clipboard ✓'
                  });
                }).catch(function () {
                  PE.ui.showError({ targetEl: activeTarget, message: 'Failed to copy to clipboard.' });
                });
              }
            }
          });
          return;
        }

        isEnhancing = false;
        var successMsg = (response && response.contextUsed)
          ? 'Prompt enhanced with chat context'
          : 'Prompt enhanced';
        doInsertEnhancedText(activeTarget, enhancedText, originalDraftText, successMsg);
      });
    } catch (sendErr) {
      isEnhancing = false;
      notifyStatus('error');
      PE.ui.showError({
        targetEl: currentTarget,
        message: sendErr.message || 'Failed to dispatch enhancement request.'
      });
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Flow 2: Grammar Correction Orchestration (Alt+Shift+G)
  // ---------------------------------------------------------------------------
  function startGrammarCorrection(sendResponse) {
    if (isEnhancing) {
      if (sendResponse) {
        sendResponse({
          ok: false,
          error: { code: 'BUSY', message: 'An operation is already in progress.' }
        });
      }
      return false;
    }

    var currentAdapter = PE.sites.forLocation(window.location);
    var currentTarget = PE.dom.findTarget(currentAdapter);

    if (!currentTarget) {
      PE.ui.showError({ message: 'Click into the text box first.' });
      if (sendResponse) {
        sendResponse({
          ok: false,
          error: { code: 'NO_TARGET', message: 'Click into the text box first.' }
        });
      }
      return false;
    }

    var raw = PE.dom.readText(currentTarget);
    if (!raw || !raw.trim()) {
      PE.ui.showError({ targetEl: currentTarget, message: 'Type some text first.' });
      if (sendResponse) {
        sendResponse({
          ok: false,
          error: { code: 'INPUT_EMPTY', message: 'Type some text first.' }
        });
      }
      return false;
    }

    var maxChars = (PE.C.LIMITS && PE.C.LIMITS.MAX_INPUT_CHARS) || 12000;
    if (raw.length > maxChars) {
      PE.ui.showError({
        targetEl: currentTarget,
        message: 'Text is too long (maximum ' + maxChars + ' characters).'
      });
      if (sendResponse) {
        sendResponse({
          ok: false,
          error: { code: 'INPUT_TOO_LONG', message: 'Text is too long.' }
        });
      }
      return false;
    }

    if (sendResponse) {
      sendResponse({ ok: true, started: true });
    }

    isEnhancing = true;
    isCancelled = false;
    originalDraftText = raw;
    originalTarget = currentTarget;

    notifyStatus('busy');

    PE.ui.showBusy({
      targetEl: currentTarget,
      mode: 'grammar',
      onCancel: function () {
        isCancelled = true;
        isEnhancing = false;
        PE.ui.hide();
        notifyStatus('done');
      }
    });

    try {
      chrome.runtime.sendMessage({
        type: PE.C.MSG.CORRECT_GRAMMAR,
        text: raw,
        source: 'content'
      }, function (response) {
        var runtimeErr = chrome.runtime.lastError;

        if (isCancelled) {
          isEnhancing = false;
          return;
        }

        if (runtimeErr) {
          isEnhancing = false;
          notifyStatus('error');
          var errMsg = runtimeErr.message || 'Communication error.';
          if (errMsg.indexOf('Extension context invalidated') !== -1) {
            errMsg = 'Prompt Enhancer was updated — please reload this page.';
          }
          PE.ui.showError({ targetEl: currentTarget, message: errMsg });
          return;
        }

        if (!response || !response.ok) {
          isEnhancing = false;
          notifyStatus('error');
          var err = response && response.error;
          var failureMessage = (err && err.message) || 'Grammar correction failed.';
          var failureDetail  = (err && err.detail) || '';
          PE.ui.showError({ targetEl: currentTarget, message: failureMessage, detail: failureDetail });
          return;
        }

        var activeTarget = currentTarget;
        if (!activeTarget.isConnected) {
          activeTarget = PE.dom.findTarget(currentAdapter);
        }

        if (!activeTarget) {
          isEnhancing = false;
          notifyStatus('error');
          PE.ui.showError({ message: 'The text box was disconnected.' });
          return;
        }

        var correctedText = response.correctedText;
        var currentText = PE.dom.readText(activeTarget);
        if (currentText !== originalDraftText) {
          isEnhancing = false;
          PE.ui.showStaleWarning({
            targetEl: activeTarget,
            message: 'The text changed while correcting grammar.',
            onInsertAnyway: function () {
              doInsertEnhancedText(activeTarget, correctedText, currentText, 'Grammar corrected ✓');
            },
            onCopy: function () {
              if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(correctedText).then(function () {
                  notifyStatus('done');
                  PE.ui.showSuccess({
                    targetEl: activeTarget,
                    message: 'Corrected text copied to clipboard ✓'
                  });
                }).catch(function () {
                  PE.ui.showError({ targetEl: activeTarget, message: 'Failed to copy to clipboard.' });
                });
              }
            }
          });
          return;
        }

        isEnhancing = false;
        doInsertEnhancedText(activeTarget, correctedText, originalDraftText, 'Grammar corrected');
      });
    } catch (sendErr) {
      isEnhancing = false;
      notifyStatus('error');
      PE.ui.showError({
        targetEl: currentTarget,
        message: sendErr.message || 'Failed to dispatch grammar correction request.'
      });
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Message Listener
  // ---------------------------------------------------------------------------
  function handleMessage(message, sender, sendResponse) {
    if (!message || typeof message.type !== 'string') {
      return false;
    }

    var MSG = PE.C.MSG;

    // 1. PING_CONTENT
    if (message.type === MSG.PING_CONTENT) {
      try {
        var adapter = PE.sites.forLocation(window.location);
        var target = PE.dom.findTarget(adapter);
        var text = target ? PE.dom.readText(target) : '';
        var contextTurns = (PE.dom && typeof PE.dom.extractConversationContext === 'function')
          ? PE.dom.extractConversationContext(adapter, target)
          : [];

        sendResponse({
          ok: true,
          site: adapter.name,
          siteId: adapter.id,
          hasTarget: Boolean(target),
          charCount: text.length,
          contextCount: contextTurns.length
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: {
            code: 'PING_FAILED',
            message: err.message || String(err)
          }
        });
      }
      return false;
    }

    // 2. START_ENHANCE
    if (message.type === MSG.START_ENHANCE) {
      startEnhancement(sendResponse);
      return false;
    }

    // 3. START_CORRECT_GRAMMAR
    if (message.type === MSG.START_CORRECT_GRAMMAR) {
      startGrammarCorrection(sendResponse);
      return false;
    }

    return false;
  }

  PE.__handleMessage = handleMessage;
  PE.__startGrammarCorrection = startGrammarCorrection;
  PE.__startEnhancement = startEnhancement;

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  // ---------------------------------------------------------------------------
  // Direct In-Page Keyboard Shortcuts (Alt+Shift+G for Grammar, Alt+Shift+E for Enhance)
  // ---------------------------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey) {
      var key = (e.key || '').toLowerCase();
      if (key === 'g' || e.code === 'KeyG') {
        e.preventDefault();
        e.stopPropagation();
        startGrammarCorrection();
      } else if (key === 'e' || e.code === 'KeyE') {
        e.preventDefault();
        e.stopPropagation();
        startEnhancement();
      }
    }
  }, true);

}());
