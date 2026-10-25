// ui-overlay.js — Prompt Enhancer
// In-page UI notifications (busy spinner, success toast with undo, error notices)
// rendered inside a closed Shadow DOM to guarantee zero CSS bleeding.
// Must be loaded after dom-utils.js in the content script load order.

/* global globalThis */

(function () {
  'use strict';

  globalThis.PE = globalThis.PE || {};

  /** @namespace PE.ui */
  var ui = {};

  var hostElement = null;
  var shadowRoot = null;
  var containerElement = null;
  var currentBusyTarget = null;
  var currentBusyContainer = null;
  var autoHideTimer = null;
  var isBusyState = false;

  var halftoneOverlayElement = null;
  var stopHalftoneAnimation = null;
  var cleanHalftoneListeners = null;

  var promptCardElement = null;
  var cleanPromptCardListeners = null;

  // ---------------------------------------------------------------------------
  // Shadow DOM Stylesheet
  // ---------------------------------------------------------------------------
  var STYLES = [
    ':host {',
    '  all: initial;',
    '  z-index: 2147483647;',
    '}',
    '.pe-toast-container {',
    '  position: fixed;',
    '  z-index: 2147483647;',
    '  box-sizing: border-box;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '  font-size: 13px;',
    '  line-height: 1.4;',
    '  color: #18181b;',
    '  background: rgba(255, 255, 255, 0.98);',
    '  border: 1px solid rgba(0, 0, 0, 0.12);',
    '  border-radius: 9999px;',
    '  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);',
    '  backdrop-filter: blur(14px);',
    '  -webkit-backdrop-filter: blur(14px);',
    '  padding: 6px 14px 6px 12px;',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 10px;',
    '  max-width: 480px;',
    '  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);',
    '  opacity: 0;',
    '  transform: translateX(-50%) translateY(8px);',
    '  pointer-events: none;',
    '}',
    '.pe-toast-container.pe-visible {',
    '  opacity: 1;',
    '  transform: translateX(-50%) translateY(0);',
    '  pointer-events: auto;',
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  .pe-toast-container {',
    '    color: #f4f4f5;',
    '    background: rgba(18, 20, 29, 0.96);',
    '    border: 1px solid rgba(139, 92, 246, 0.35);',
    '    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(139, 92, 246, 0.18);',
    '  }',
    '}',
    '@media (max-width: 540px) {',
    '  .pe-toast-container {',
    '    max-width: calc(100vw - 32px);',
    '    font-size: 12px;',
    '    padding: 5px 10px 5px 10px;',
    '    gap: 8px;',
    '  }',
    '}',
    '.pe-toast-header {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  gap: 12px;',
    '}',
    '.pe-toast-content {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 10px;',
    '  flex: 1;',
    '}',
    '.pe-toast-message {',
    '  font-weight: 500;',
    '  word-break: break-word;',
    '}',
    '.pe-spinner {',
    '  width: 14px;',
    '  height: 14px;',
    '  border: 2px solid #6366f1;',
    '  border-top-color: transparent;',
    '  border-radius: 50%;',
    '  display: inline-block;',
    '  flex-shrink: 0;',
    '  animation: pe-spin 0.75s linear infinite;',
    '}',
    '@keyframes pe-spin {',
    '  to { transform: rotate(360deg); }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  .pe-spinner { animation: none; border-top-color: #6366f1; opacity: 0.7; }',
    '  .pe-toast-container { transition: none; }',
    '}',
    '.pe-btn {',
    '  all: unset;',
    '  box-sizing: border-box;',
    '  cursor: pointer;',
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  border-radius: 6px;',
    '  padding: 4px 10px;',
    '  font-size: 12px;',
    '  font-weight: 500;',
    '  transition: background-color 0.15s ease, opacity 0.15s ease;',
    '  flex-shrink: 0;',
    '}',
    '.pe-btn:focus-visible {',
    '  outline: 2px solid #6366f1;',
    '  outline-offset: 1px;',
    '}',
    '.pe-btn-cancel {',
    '  background: rgba(0, 0, 0, 0.06);',
    '  color: inherit;',
    '}',
    '.pe-btn-cancel:hover {',
    '  background: rgba(0, 0, 0, 0.12);',
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  .pe-btn-cancel { background: rgba(255, 255, 255, 0.1); }',
    '  .pe-btn-cancel:hover { background: rgba(255, 255, 255, 0.18); }',
    '}',
    '.pe-btn-undo {',
    '  background: #6366f1;',
    '  color: #ffffff;',
    '}',
    '.pe-btn-undo:hover {',
    '  background: #4f46e5;',
    '}',
    '.pe-btn-close {',
    '  padding: 2px 6px;',
    '  color: #71717a;',
    '}',
    '.pe-btn-close:hover {',
    '  color: inherit;',
    '}',
    '.pe-details-toggle {',
    '  all: unset;',
    '  cursor: pointer;',
    '  color: #6366f1;',
    '  font-size: 11px;',
    '  text-decoration: underline;',
    '}',
    '.pe-details-box {',
    '  margin-top: 4px;',
    '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;',
    '  font-size: 11px;',
    '  padding: 6px 8px;',
    '  background: rgba(0, 0, 0, 0.05);',
    '  border-radius: 4px;',
    '  max-height: 120px;',
    '  overflow-y: auto;',
    '  white-space: pre-wrap;',
    '  word-break: break-all;',
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  .pe-details-box { background: rgba(255, 255, 255, 0.05); }',
    '}',
    '.pe-icon-success { color: #10b981; font-weight: bold; font-size: 14px; flex-shrink: 0; }',
    '.pe-icon-warn { color: #f59e0b; font-weight: bold; font-size: 14px; flex-shrink: 0; }',
    '.pe-icon-error { color: #ef4444; font-weight: bold; font-size: 14px; flex-shrink: 0; }',
    '.pe-toast-actions { display: flex; align-items: center; gap: 8px; margin-top: 4px; }',
    '.pe-btn-insert-anyway { background: #6366f1; color: #ffffff; }',
    '.pe-btn-insert-anyway:hover { background: #4f46e5; }',
    '.pe-btn-copy-stale { background: rgba(0, 0, 0, 0.06); color: inherit; }',
    '.pe-btn-copy-stale:hover { background: rgba(0, 0, 0, 0.12); }',
    '@media (prefers-color-scheme: dark) {',
    '  .pe-btn-copy-stale { background: rgba(255, 255, 255, 0.1); }',
    '  .pe-btn-copy-stale:hover { background: rgba(255, 255, 255, 0.18); }',
    '}',
    '',
    '/* Halftone animated dot grid input overlay */',
    '.pe-halftone-overlay {',
    '  position: fixed;',
    '  z-index: 2147483646;',
    '  box-sizing: border-box;',
    '  overflow: hidden;',
    '  contain: paint;',
    '  isolation: isolate;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  pointer-events: auto;',
    '  opacity: 0;',
    '  transition: opacity 0.20s cubic-bezier(0.16, 1, 0.3, 1);',
    '  backdrop-filter: blur(8px);',
    '  -webkit-backdrop-filter: blur(8px);',
    '  clip-path: inset(0 round 26px);',
    '  -webkit-clip-path: inset(0 round 26px);',
    '}',
    '.pe-halftone-overlay.pe-visible {',
    '  opacity: 1;',
    '}',
    '.pe-halftone-canvas {',
    '  position: absolute;',
    '  top: 0;',
    '  left: 0;',
    '  width: 100%;',
    '  height: 100%;',
    '  pointer-events: none;',
    '  display: block;',
    '  border-radius: inherit;',
    '}',
    '.pe-halftone-badge {',
    '  position: relative;',
    '  z-index: 2;',
    '  box-sizing: border-box;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '  font-size: 13px;',
    '  font-weight: 500;',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 12px;',
    '  padding: 6px 14px 6px 12px;',
    '  border-radius: 9999px;',
    '  border: 1px solid rgba(255, 255, 255, 0.15);',
    '  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);',
    '  backdrop-filter: blur(16px);',
    '  -webkit-backdrop-filter: blur(16px);',
    '  user-select: none;',
    '  animation: pe-badge-float 3s ease-in-out infinite alternate;',
    '}',
    '@keyframes pe-badge-float {',
    '  0% { transform: translateY(0); }',
    '  100% { transform: translateY(-2px); }',
    '}',
    '.pe-halftone-status {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '}',
    '.pe-halftone-pulse-dot {',
    '  width: 8px;',
    '  height: 8px;',
    '  border-radius: 50%;',
    '  display: inline-block;',
    '  position: relative;',
    '  flex-shrink: 0;',
    '}',
    '.pe-halftone-pulse-dot::after {',
    '  content: "";',
    '  position: absolute;',
    '  top: -2px;',
    '  left: -2px;',
    '  right: -2px;',
    '  bottom: -2px;',
    '  border-radius: 50%;',
    '  border: 1.5px solid currentColor;',
    '  opacity: 0.8;',
    '  animation: pe-pulse-ring 1.6s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;',
    '}',
    '@keyframes pe-pulse-ring {',
    '  0% { transform: scale(0.8); opacity: 0.9; }',
    '  70% { transform: scale(2.2); opacity: 0; }',
    '  100% { transform: scale(2.2); opacity: 0; }',
    '}',
    '.pe-halftone-icon {',
    '  font-size: 14px;',
    '  line-height: 1;',
    '}',
    '.pe-halftone-title {',
    '  letter-spacing: -0.01em;',
    '  font-weight: 600;',
    '}',
    '.pe-halftone-cancel-btn {',
    '  all: unset;',
    '  cursor: pointer;',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 4px;',
    '  padding: 3px 8px;',
    '  border-radius: 9999px;',
    '  font-size: 11px;',
    '  font-weight: 500;',
    '  transition: background-color 0.15s ease, opacity 0.15s ease;',
    '}',
    '.pe-halftone-cancel-btn kbd {',
    '  font-family: inherit;',
    '  font-size: 9px;',
    '  padding: 1px 4px;',
    '  border-radius: 4px;',
    '  opacity: 0.8;',
    '}',
    '',
    '/* Floating Prompt Card directly above the input field */',
    '.pe-prompt-card {',
    '  position: fixed;',
    '  z-index: 2147483647;',
    '  box-sizing: border-box;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '  font-size: 13px;',
    '  line-height: 1.5;',
    '  color: #f4f4f5;',
    '  background: rgba(18, 20, 29, 0.96);',
    '  border: 1px solid rgba(139, 92, 246, 0.4);',
    '  border-radius: 14px;',
    '  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 24px rgba(139, 92, 246, 0.2);',
    '  backdrop-filter: blur(16px);',
    '  -webkit-backdrop-filter: blur(16px);',
    '  display: flex;',
    '  flex-direction: column;',
    '  overflow: hidden;',
    '  max-width: 780px;',
    '  min-width: 320px;',
    '  opacity: 0;',
    '  transform: translateY(8px) scale(0.99);',
    '  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);',
    '  pointer-events: auto;',
    '}',
    '.pe-prompt-card.pe-visible {',
    '  opacity: 1;',
    '  transform: translateY(0) scale(1);',
    '}',
    '@media (prefers-color-scheme: light) {',
    '  .pe-prompt-card {',
    '    color: #0f172a;',
    '    background: rgba(255, 255, 255, 0.98);',
    '    border: 1px solid rgba(139, 92, 246, 0.35);',
    '    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.16), 0 0 20px rgba(139, 92, 246, 0.12);',
    '  }',
    '}',
    '.pe-card-topbar {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  padding: 10px 14px;',
    '  border-bottom: 1px solid rgba(255, 255, 255, 0.08);',
    '  background: rgba(255, 255, 255, 0.02);',
    '  gap: 12px;',
    '}',
    '@media (prefers-color-scheme: light) {',
    '  .pe-card-topbar {',
    '    border-bottom: 1px solid rgba(0, 0, 0, 0.08);',
    '    background: rgba(0, 0, 0, 0.02);',
    '  }',
    '}',
    '.pe-card-title-group {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '}',
    '.pe-card-badge {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  font-size: 12px;',
    '  font-weight: 600;',
    '  color: #c084fc;',
    '}',
    '.pe-card-meta {',
    '  font-size: 11px;',
    '  color: #94a3b8;',
    '  font-weight: 500;',
    '}',
    '.pe-card-body {',
    '  padding: 12px 14px;',
    '  overflow-y: auto;',
    '  max-height: 240px;',
    '  font-size: 13px;',
    '  line-height: 1.55;',
    '  white-space: pre-wrap;',
    '  word-break: break-word;',
    '  user-select: text;',
    '  background: transparent;',
    '  color: inherit;',
    '}',
    '.pe-card-footer {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  padding: 8px 14px;',
    '  border-top: 1px solid rgba(255, 255, 255, 0.08);',
    '  background: rgba(255, 255, 255, 0.02);',
    '  gap: 10px;',
    '}',
    '@media (prefers-color-scheme: light) {',
    '  .pe-card-footer {',
    '    border-top: 1px solid rgba(0, 0, 0, 0.08);',
    '    background: rgba(0, 0, 0, 0.02);',
    '  }',
    '}',
    '.pe-card-hint {',
    '  font-size: 11px;',
    '  color: #94a3b8;',
    '  font-weight: 400;',
    '}',
    '.pe-card-actions {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '}',
    '.pe-btn-insert-main {',
    '  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);',
    '  color: #ffffff;',
    '  padding: 6px 14px;',
    '  border-radius: 8px;',
    '  font-weight: 600;',
    '  font-size: 12px;',
    '  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.35);',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  cursor: pointer;',
    '  transition: opacity 0.15s ease, transform 0.15s ease;',
    '}',
    '.pe-btn-insert-main:hover {',
    '  opacity: 0.95;',
    '  transform: translateY(-1px);',
    '}',
    '.pe-btn-copy-main {',
    '  background: rgba(6, 182, 212, 0.12);',
    '  border: 1px solid rgba(6, 182, 212, 0.3);',
    '  color: #22d3ee;',
    '  padding: 6px 12px;',
    '  border-radius: 8px;',
    '  font-weight: 500;',
    '  font-size: 12px;',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 5px;',
    '  cursor: pointer;',
    '  transition: background-color 0.15s ease;',
    '}',
    '.pe-btn-copy-main:hover {',
    '  background: rgba(6, 182, 212, 0.22);',
    '}',
    '.pe-btn-dismiss-main {',
    '  background: rgba(255, 255, 255, 0.08);',
    '  color: #94a3b8;',
    '  padding: 6px 10px;',
    '  border-radius: 8px;',
    '  font-weight: 500;',
    '  font-size: 12px;',
    '  display: inline-flex;',
    '  align-items: center;',
    '  cursor: pointer;',
    '  transition: background-color 0.15s ease, color 0.15s ease;',
    '}',
    '.pe-btn-dismiss-main:hover {',
    '  background: rgba(255, 255, 255, 0.14);',
    '  color: #f4f4f5;',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Shadow Root Setup
  // ---------------------------------------------------------------------------
  function ensureHost() {
    if (hostElement && hostElement.isConnected && shadowRoot) {
      return shadowRoot;
    }

    // Reuse existing element if present in DOM
    var existingHost = document.getElementById('pe-overlay-host');
    if (existingHost) {
      existingHost.remove();
    }

    hostElement = document.createElement('div');
    hostElement.id = 'pe-overlay-host';
    (document.documentElement || document.body).appendChild(hostElement);

    // Closed shadow DOM prevents site CSS from bleeding in or out
    shadowRoot = hostElement.attachShadow({ mode: 'closed' });

    var styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    shadowRoot.appendChild(styleEl);

    containerElement = document.createElement('div');
    containerElement.className = 'pe-toast-container';
    containerElement.setAttribute('role', 'status');
    containerElement.setAttribute('aria-live', 'polite');
    shadowRoot.appendChild(containerElement);

    return shadowRoot;
  }

  function clearAutoHide() {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Site Theme & Accent Color Detection
  // ---------------------------------------------------------------------------
  function detectThemeAndColors(targetEl) {
    var isDark = false;
    var primaryRgb = [55, 115, 220]; // Default Halftone blue from user: rgba(55, 115, 220)
    var secondaryRgb = [14, 165, 233]; // Cyan
    var host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';

    try {
      if (typeof document !== 'undefined') {
        var docEl = document.documentElement;
        var body = document.body;

        var hasDarkClass = (docEl && docEl.classList.contains('dark')) ||
          (body && body.classList.contains('dark')) ||
          (docEl && docEl.getAttribute('data-theme') === 'dark') ||
          (docEl && docEl.getAttribute('data-color-mode') === 'dark');

        var prefersDark = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

        var isBgDark = false;
        if (typeof window !== 'undefined' && window.getComputedStyle) {
          var currEl = targetEl;
          while (currEl && currEl !== document.documentElement) {
            var bg = window.getComputedStyle(currEl).backgroundColor;
            if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
              var rgbMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (rgbMatch) {
                var r = parseInt(rgbMatch[1], 10);
                var g = parseInt(rgbMatch[2], 10);
                var b = parseInt(rgbMatch[3], 10);
                var lum = 0.299 * r + 0.587 * g + 0.114 * b;
                isBgDark = (lum < 130);
                break;
              }
            }
            currEl = currEl.parentElement;
          }
          if (!isBgDark && body) {
            var bodyBg = window.getComputedStyle(body).backgroundColor;
            if (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') {
              var bodyMatch = bodyBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (bodyMatch) {
                var br = parseInt(bodyMatch[1], 10);
                var bg2 = parseInt(bodyMatch[2], 10);
                var bb = parseInt(bodyMatch[3], 10);
                var bodyLum = 0.299 * br + 0.587 * bg2 + 0.114 * bb;
                isBgDark = (bodyLum < 130);
              }
            }
          }
        }

        isDark = Boolean(hasDarkClass || isBgDark || (prefersDark && !isBgDark));
      }
    } catch (e) {
      isDark = true;
    }

    // Site-specific themes & brand palettes
    if (/chatgpt\.com|chat\.openai\.com/i.test(host)) {
      if (isDark) {
        primaryRgb = [16, 185, 129]; // Emerald / ChatGPT green
        secondaryRgb = [55, 115, 220]; // Tech blue
      } else {
        primaryRgb = [16, 163, 127];
        secondaryRgb = [37, 99, 235];
      }
    } else if (/claude\.ai/i.test(host)) {
      if (isDark) {
        primaryRgb = [217, 119, 6]; // Claude terracotta / warm amber
        secondaryRgb = [234, 88, 12];
      } else {
        primaryRgb = [194, 65, 12];
        secondaryRgb = [217, 119, 6];
      }
    } else if (/gemini\.google\.com/i.test(host)) {
      if (isDark) {
        primaryRgb = [66, 133, 244]; // Google Blue
        secondaryRgb = [168, 85, 247]; // Purple
      } else {
        primaryRgb = [26, 115, 232];
        secondaryRgb = [147, 51, 234];
      }
    } else if (/deepseek\.com/i.test(host)) {
      primaryRgb = [77, 107, 254]; // DeepSeek blue
      secondaryRgb = [56, 189, 248];
    } else {
      if (isDark) {
        primaryRgb = [55, 115, 220]; // Animated Halftone Blue
        secondaryRgb = [14, 165, 233];
      } else {
        primaryRgb = [37, 99, 235];
        secondaryRgb = [79, 70, 229];
      }
    }

    return {
      isDark: isDark,
      primaryRgb: primaryRgb,
      secondaryRgb: secondaryRgb,
      overlayBg: isDark ? 'rgba(8, 10, 16, 0.93)' : 'rgba(255, 255, 255, 0.93)',
      badgeBg: isDark ? 'rgba(18, 22, 34, 0.90)' : 'rgba(255, 255, 255, 0.95)',
      textColor: isDark ? '#f8fafc' : '#0f172a',
      subTextColor: isDark ? '#94a3b8' : '#64748b',
      borderColor: 'rgba(' + primaryRgb.join(',') + ', 0.45)'
    };
  }

  // ---------------------------------------------------------------------------
  // Halftone Dot Grid Animation Engine
  // ---------------------------------------------------------------------------
  function startHalftoneAnimation(canvas, theme, onFrame) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      return function () {};
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      return function () {};
    }

    var animId = null;
    var time = 0;
    var frameCount = 0;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

    var pR = theme.primaryRgb[0];
    var pG = theme.primaryRgb[1];
    var pB = theme.primaryRgb[2];

    var sR = theme.secondaryRgb[0];
    var sG = theme.secondaryRgb[1];
    var sB = theme.secondaryRgb[2];

    function draw() {
      frameCount++;
      if (typeof onFrame === 'function' && (frameCount % 6 === 0)) {
        try { onFrame(); } catch (e) {}
      }
      var w = canvas.clientWidth || canvas.offsetWidth || 300;
      var h = canvas.clientHeight || canvas.offsetHeight || 80;
      if (w <= 0 || h <= 0) {
        animId = requestAnimationFrame(draw);
        return;
      }

      var expectedW = Math.round(w * dpr);
      var expectedH = Math.round(h * dpr);
      if (canvas.width !== expectedW || canvas.height !== expectedH) {
        canvas.width = expectedW;
        canvas.height = expectedH;
        if (typeof ctx.setTransform === 'function') {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }

      // Motion blur persistence trail: gently fade previous frame
      try {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      } catch (e) {
        ctx.clearRect(0, 0, w, h);
      }

      time += 0.020;

      // Small, refined micro-dots with high density
      var spacing = 11;
      var minRadius = 0.55;
      var maxRadius = 1.85;

      if (h < 65) {
        spacing = 10;
        minRadius = 0.50;
        maxRadius = 1.60;
      } else if (h > 140) {
        spacing = 12;
        minRadius = 0.65;
        maxRadius = 2.10;
      }

      // Two invisible moving hotspots drifting across the field
      var spot1X = w * 0.5 + Math.cos(time) * (w * 0.38);
      var spot1Y = h * 0.5 + Math.sin(time * 0.7) * (h * 0.32);

      var spot2X = w * 0.5 + Math.sin(time * 0.8) * (w * 0.38);
      var spot2Y = h * 0.5 + Math.cos(time * 1.1) * (h * 0.32);

      var maxDist = Math.max(90, Math.min(Math.max(w, h) * 0.45, 340));

      for (var x = spacing / 2; x < w; x += spacing) {
        for (var y = spacing / 2; y < h; y += spacing) {
          var dist1 = Math.hypot(x - spot1X, y - spot1Y);
          var dist2 = Math.hypot(x - spot2X, y - spot2Y);

          var intensity1 = Math.max(0, 1 - dist1 / maxDist);
          var intensity2 = Math.max(0, 1 - dist2 / maxDist);

          var intensity = Math.min(1, Math.pow(intensity1, 2) + Math.pow(intensity2, 2));

          var radius = minRadius + intensity * (maxRadius - minRadius);
          var alpha = theme.isDark
            ? (0.10 + intensity * 0.88)
            : (0.12 + intensity * 0.84);

          // Blend primary and secondary colors based on relative hotspot proximity
          var ratio = (dist1 + 1) / (dist1 + dist2 + 2);
          var cr = Math.round(pR * (1 - ratio) + sR * ratio);
          var cg = Math.round(pG * (1 - ratio) + sG * ratio);
          var cb = Math.round(pB * (1 - ratio) + sB * ratio);

          // Optical circular motion blur glow
          if (intensity > 0.10) {
            ctx.shadowBlur = Math.round(intensity * 8);
            ctx.shadowColor = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (alpha * 0.85).toFixed(3) + ')';

            // Soft circular outer motion-blur halo
            ctx.beginPath();
            ctx.arc(x, y, radius * 1.7, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (alpha * 0.25).toFixed(3) + ')';
            ctx.fill();
          } else {
            ctx.shadowBlur = 0;
          }

          // Core circular dot (always a perfect circle, never stretched into capsules/pills)
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + alpha.toFixed(3) + ')';
          ctx.fill();
        }
      }

      ctx.shadowBlur = 0;
      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);

    return function stop() {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    };
  }

  function removeHalftoneOverlay() {
    if (stopHalftoneAnimation) {
      try { stopHalftoneAnimation(); } catch (e) {}
      stopHalftoneAnimation = null;
    }
    if (cleanHalftoneListeners) {
      try { cleanHalftoneListeners(); } catch (e) {}
      cleanHalftoneListeners = null;
    }
    if (halftoneOverlayElement) {
      try { halftoneOverlayElement.remove(); } catch (e) {}
      halftoneOverlayElement = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Outer Chat Input Container Resolution
  // Finds the outer pill / card bar (e.g. in ChatGPT, Claude, Gemini) so the
  // animated halftone overlay fills the full rounded bar from edge to edge,
  // strictly excluding disclaimer footers and chat history containers.
  // ---------------------------------------------------------------------------
  function findOuterInputContainer(targetEl) {
    if (!targetEl || !targetEl.parentElement) return targetEl;

    // If PE.dom has the shared resolver, prefer it
    if (typeof globalThis !== 'undefined' && globalThis.PE && globalThis.PE.dom && typeof globalThis.PE.dom.findOuterInputContainer === 'function') {
      try {
        var resolved = globalThis.PE.dom.findOuterInputContainer(targetEl);
        if (resolved) return resolved;
      } catch (e) {}
    }

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
        if (rect.height > 380 || rect.height > winHFallback * 0.6) break;

        if (curr.matches && curr.matches('main, article, section, [role="log"], [role="feed"], [role="main"], form, .conversation-container, #chat-history')) {
          curr = curr.parentElement;
          continue;
        }

        var cs = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(curr) : null;
        var radiusVal = cs ? (parseFloat(cs.borderRadius) || parseFloat(cs.borderTopLeftRadius) || 0) : 0;
        var hasBg = cs && cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
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

        if (rect.height > targetRect.height + 150) {
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
  }

  function mountHalftoneOverlay(targetEl, theme, options) {
    removeHalftoneOverlay();

    options = options || {};
    var onCancel = options.onCancel;
    var mode = options.mode || 'enhance';
    var message = options.message || (mode === 'grammar' ? 'Correcting grammar…' : 'Enhancing prompt…');
    var svgWand = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><defs><linearGradient id="wandLoadGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#C084FC"/><stop offset="100%" stop-color="#6366F1"/></linearGradient></defs><path d="M4 20l9-9" stroke="url(#wandLoadGrad)" stroke-width="2.2" stroke-linecap="round"/><path d="M13 11l-1-1L15.5 6.5l2 2L14 12l-1-1z" fill="url(#wandLoadGrad)"/><path d="M19 2l.5 1.2L20.7 3.7l-1.2.5L19 5.4l-.5-1.2L17.3 3.7l1.2-.5L19 2z" fill="#FDE047"/></svg>';
    var svgPen  = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><defs><linearGradient id="penLoadGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FDA4AF"/><stop offset="100%" stop-color="#F43F5E"/></linearGradient></defs><path d="M12 20h9" stroke="#FDA4AF" stroke-width="1.8" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="url(#penLoadGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="url(#penLoadGrad)" fill-opacity="0.18"/><circle cx="17.5" cy="5" r="1" fill="#FDE047"/></svg>';
    var iconSvg = mode === 'grammar' ? svgPen : svgWand;

    var containerEl = findOuterInputContainer(targetEl);

    var overlay = document.createElement('div');
    overlay.className = 'pe-halftone-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    function updateGeometry() {
      if (!targetEl || !targetEl.isConnected || !overlay) return;
      try {
        var hostBox = (containerEl && containerEl.isConnected) ? containerEl : targetEl;
        var targetRect = targetEl.getBoundingClientRect();
        var rect = hostBox.getBoundingClientRect();
        var winW = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1920;

        // Safety guard: if hostBox is collapsed, wider than viewport, or more than 100px taller than targetEl, fallback to targetEl
        if (rect.width <= 0 || rect.height <= 0 || rect.width > winW - 10 || (targetRect.height > 0 && rect.height > targetRect.height + 100)) {
          rect = targetRect;
          hostBox = targetEl;
        }
        if (rect.width <= 0 || rect.height <= 0) return;

        var radius = '26px';
        if (typeof window !== 'undefined' && window.getComputedStyle) {
          var cs = window.getComputedStyle(hostBox);
          var tl = cs.borderTopLeftRadius || '';
          var tr = cs.borderTopRightRadius || '';
          var br = cs.borderBottomRightRadius || '';
          var bl = cs.borderBottomLeftRadius || '';
          var hostRadius = parseFloat(tl) || parseFloat(cs.borderRadius) || 0;

          if (hostRadius >= 8) {
            radius = (tl === tr && tr === br && br === bl && tl) ? tl : (tl + ' ' + tr + ' ' + br + ' ' + bl);
          } else {
            var tcs = window.getComputedStyle(targetEl);
            var targetRadius = parseFloat(tcs.borderRadius) || 0;
            if (targetRadius >= 8) {
              radius = tcs.borderRadius;
            } else {
              var roundedChild = hostBox.querySelector('[style*="border-radius"], [class*="rounded"]');
              if (roundedChild) {
                var ccs = window.getComputedStyle(roundedChild);
                if (parseFloat(ccs.borderRadius) >= 8) {
                  radius = ccs.borderRadius;
                }
              }
            }
          }
        }

        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.borderRadius = radius;
        overlay.style.clipPath = 'inset(0 round ' + radius + ')';
        if (overlay.style.webkitClipPath !== undefined) {
          overlay.style.webkitClipPath = 'inset(0 round ' + radius + ')';
        }
      } catch (e) {}
    }

    updateGeometry();

    overlay.style.background = theme.overlayBg;
    overlay.style.border = 'none';
    overlay.style.outline = 'none';
    overlay.style.boxShadow = 'none';

    // Halftone Canvas
    var canvas = document.createElement('canvas');
    canvas.className = 'pe-halftone-canvas';
    overlay.appendChild(canvas);

    // Floating Status Badge
    var badge = document.createElement('div');
    badge.className = 'pe-halftone-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    badge.style.background = theme.badgeBg;
    badge.style.color = theme.textColor;
    badge.style.borderColor = 'rgba(' + theme.primaryRgb.join(',') + ', 0.3)';

    var statusWrapper = document.createElement('div');
    statusWrapper.className = 'pe-halftone-status';

    var pulseDot = document.createElement('span');
    pulseDot.className = 'pe-halftone-pulse-dot';
    pulseDot.style.backgroundColor = 'rgb(' + theme.primaryRgb.join(',') + ')';
    pulseDot.style.color = 'rgb(' + theme.primaryRgb.join(',') + ')';
    pulseDot.style.boxShadow = '0 0 8px rgb(' + theme.primaryRgb.join(',') + ')';
    statusWrapper.appendChild(pulseDot);

    var iconSpan = document.createElement('span');
    iconSpan.className = 'pe-halftone-icon';
    iconSpan.innerHTML = iconSvg;
    statusWrapper.appendChild(iconSpan);

    var titleSpan = document.createElement('span');
    titleSpan.className = 'pe-halftone-title';
    titleSpan.textContent = message;
    statusWrapper.appendChild(titleSpan);

    badge.appendChild(statusWrapper);

    if (typeof onCancel === 'function') {
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'pe-halftone-cancel-btn';
      cancelBtn.style.color = theme.subTextColor;
      cancelBtn.style.backgroundColor = theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
      cancelBtn.innerHTML = 'Cancel <kbd style="background:' + (theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)') + '; color:' + theme.textColor + ';">Esc</kbd>';

      cancelBtn.addEventListener('mouseenter', function () {
        cancelBtn.style.backgroundColor = theme.isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)';
        cancelBtn.style.color = theme.textColor;
      });
      cancelBtn.addEventListener('mouseleave', function () {
        cancelBtn.style.backgroundColor = theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
        cancelBtn.style.color = theme.subTextColor;
      });

      cancelBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ui.hide();
        onCancel();
      });

      badge.appendChild(cancelBtn);
    }

    overlay.appendChild(badge);
    shadowRoot.appendChild(overlay);

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        if (overlay) {
          overlay.classList.add('pe-visible');
        }
      });
    } else {
      overlay.classList.add('pe-visible');
    }

    var onReposition = function () {
      updateGeometry();
    };

    halftoneOverlayElement = overlay;
    stopHalftoneAnimation = startHalftoneAnimation(canvas, theme, onReposition);

    var onKeyEsc = function (e) {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        ui.hide();
        if (typeof onCancel === 'function') {
          onCancel();
        }
      }
    };

    var resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
      try {
        resizeObserver = new ResizeObserver(function () {
          updateGeometry();
        });
        if (containerEl && containerEl.isConnected) {
          resizeObserver.observe(containerEl);
        }
        if (targetEl && targetEl.isConnected && targetEl !== containerEl) {
          resizeObserver.observe(targetEl);
        }
      } catch (e) {}
    }

    window.addEventListener('scroll', onReposition, { passive: true, capture: true });
    window.addEventListener('resize', onReposition, { passive: true });
    window.addEventListener('keydown', onKeyEsc, true);

    cleanHalftoneListeners = function () {
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch (e) {}
        resizeObserver = null;
      }
      window.removeEventListener('scroll', onReposition, { capture: true });
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('keydown', onKeyEsc, true);
    };
  }

  function clearBusyTarget() {
    removeHalftoneOverlay();
    if (currentBusyTarget && currentBusyTarget.isConnected) {
      try {
        currentBusyTarget.removeAttribute('aria-busy');
      } catch (e) {}
    }
    currentBusyTarget = null;
    currentBusyContainer = null;
    isBusyState = false;
  }

  /**
   * Position the toast container cleanly ABOVE IN THE MIDDLE of the input box or pill.
   * Never overlaps the input bar.
   * @param {Element} targetEl
   */
  function positionToast(targetEl) {
    if (!containerElement) { return; }

    if (targetEl && targetEl.isConnected) {
      try {
        var hostBox = findOuterInputContainer(targetEl) || targetEl;
        var rect = hostBox.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          rect = targetEl.getBoundingClientRect();
        }
        if (rect.width > 0 && rect.height > 0) {
          // Position cleanly ABOVE the top edge of the input container with comfortable breathing room
          var bottomDist = Math.max(24, window.innerHeight - rect.top + 26);
          // Position horizontally in the exact center/middle of the input container
          var midX = Math.round(rect.left + rect.width / 2);

          containerElement.style.bottom = bottomDist + 'px';
          containerElement.style.left = midX + 'px';
          containerElement.style.right = 'auto';
          return;
        }
      } catch (e) {}
    }

    containerElement.style.left = '50%';
    containerElement.style.right = 'auto';
    containerElement.style.bottom = '32px';
  }

  // ---------------------------------------------------------------------------
  // Public UI API
  // ---------------------------------------------------------------------------

  /**
   * Check if the UI is currently in the busy state.
   * @returns {boolean}
   */
  ui.isBusy = function () {
    return isBusyState;
  };

  /**
   * Display the animated halftone dot grid overlay directly on the text input field.
   * Detects site theme, applies perfect sizing, and shows status with cancel button.
   * @param {Object} options
   * @param {Element} [options.targetEl] - Editable element being enhanced
   * @param {Function} [options.onCancel] - Callback invoked if user clicks Cancel or presses Esc
   * @param {string} [options.mode] - 'enhance' or 'grammar'
   * @param {string} [options.message] - Status message
   */
  ui.showBusy = function (options) {
    clearAutoHide();
    clearBusyTarget();
    ensureHost();

    options = options || {};
    var targetEl = options.targetEl;
    var onCancel = options.onCancel;
    var mode = options.mode || 'enhance';
    var defaultMsg = (mode === 'grammar') ? 'Correcting grammar…' : 'Enhancing prompt…';
    var messageText = options.message || defaultMsg;

    isBusyState = true;

    if (targetEl && targetEl.isConnected) {
      currentBusyTarget = targetEl;
      var containerEl = findOuterInputContainer(targetEl);
      currentBusyContainer = containerEl;
      var theme = detectThemeAndColors(targetEl);

      try {
        targetEl.setAttribute('aria-busy', 'true');
      } catch (e) {}

      mountHalftoneOverlay(targetEl, theme, {
        onCancel: onCancel,
        mode: mode,
        message: messageText
      });
      return;
    }

    // Fallback if target element is not directly in DOM (e.g. background call or test mock)
    containerElement.textContent = '';
    positionToast(targetEl);

    var header = document.createElement('div');
    header.className = 'pe-toast-header';

    var content = document.createElement('div');
    content.className = 'pe-toast-content';

    var spinner = document.createElement('span');
    spinner.className = 'pe-spinner';
    content.appendChild(spinner);

    var msg = document.createElement('span');
    msg.className = 'pe-toast-message';
    msg.textContent = messageText;
    content.appendChild(msg);

    header.appendChild(content);

    if (typeof onCancel === 'function') {
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'pe-btn pe-btn-cancel';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () {
        ui.hide();
        onCancel();
      });
      header.appendChild(cancelBtn);
    }

    containerElement.appendChild(header);
    containerElement.classList.add('pe-visible');
  };

  /**
   * Display the success toast with an Undo button.
   * Auto-hides after LIMITS.TOAST_SUCCESS_MS (8000ms).
   * @param {Object} options
   * @param {Element} [options.targetEl]
   * @param {string} [options.message]
   * @param {Function} [options.onUndo]
   */
  ui.showSuccess = function (options) {
    clearAutoHide();
    clearBusyTarget();
    ensureHost();

    options = options || {};
    var targetEl = options.targetEl;
    var messageText = options.message || 'Prompt enhanced';
    var onUndo = options.onUndo;

    containerElement.textContent = '';
    positionToast(targetEl);

    var header = document.createElement('div');
    header.className = 'pe-toast-header';

    var content = document.createElement('div');
    content.className = 'pe-toast-content';

    var icon = document.createElement('span');
    icon.className = 'pe-icon-success';
    icon.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none"><defs><linearGradient id="toastCheckGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34D399"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><circle cx="10" cy="10" r="9" fill="url(#toastCheckGrad)" fill-opacity="0.22" stroke="url(#toastCheckGrad)" stroke-width="1.8"/><path d="M6 10.2l2.6 2.6 5.4-5.6" stroke="#34D399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    content.appendChild(icon);

    var msg = document.createElement('span');
    msg.className = 'pe-toast-message';
    msg.textContent = messageText;
    content.appendChild(msg);

    header.appendChild(content);

    if (typeof onUndo === 'function') {
      var undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'pe-btn pe-btn-undo';
      undoBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none"><defs><linearGradient id="undoGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FDE047"/><stop offset="100%" stop-color="#F59E0B"/></linearGradient></defs><path d="M3 7v6h6" stroke="url(#undoGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" stroke="url(#undoGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Undo</span>';
      undoBtn.addEventListener('click', function () {
        ui.hide();
        onUndo();
      });
      header.appendChild(undoBtn);
    }

    containerElement.appendChild(header);
    containerElement.classList.add('pe-visible');

    // Reposition on scroll/resize while toast is active
    var onToastReposition = function () {
      positionToast(targetEl);
    };
    window.addEventListener('scroll', onToastReposition, { passive: true, capture: true });
    window.addEventListener('resize', onToastReposition, { passive: true });

    var timeoutMs = (globalThis.PE.C && globalThis.PE.C.LIMITS && globalThis.PE.C.LIMITS.TOAST_SUCCESS_MS) || 8000;
    autoHideTimer = setTimeout(function () {
      window.removeEventListener('scroll', onToastReposition, { capture: true });
      window.removeEventListener('resize', onToastReposition);
      ui.hide();
    }, timeoutMs);
  };

  /**
   * Display an error notice with optional details and close button.
   * Auto-hides after LIMITS.TOAST_ERROR_MS (10000ms).
   * @param {Object} options
   * @param {Element} [options.targetEl]
   * @param {string} options.message
   * @param {string} [options.detail]
   * @param {Function} [options.onClose]
   */
  ui.showError = function (options) {
    clearAutoHide();
    clearBusyTarget();
    ensureHost();

    options = options || {};
    var targetEl = options.targetEl;
    var messageText = options.message || 'An error occurred during enhancement.';
    var detailText = options.detail || '';
    var onClose = options.onClose;

    containerElement.textContent = '';
    positionToast(targetEl);

    var header = document.createElement('div');
    header.className = 'pe-toast-header';

    var content = document.createElement('div');
    content.className = 'pe-toast-content';

    var icon = document.createElement('span');
    icon.className = 'pe-icon-error';
    icon.textContent = '✗';
    content.appendChild(icon);

    var msg = document.createElement('span');
    msg.className = 'pe-toast-message';
    msg.textContent = messageText;
    content.appendChild(msg);

    header.appendChild(content);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pe-btn pe-btn-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', function () {
      ui.hide();
      if (typeof onClose === 'function') {
        onClose();
      }
    });
    header.appendChild(closeBtn);

    containerElement.appendChild(header);

    // Collapsible Details toggle if detail string provided
    if (detailText) {
      var detailsToggle = document.createElement('button');
      detailsToggle.type = 'button';
      detailsToggle.className = 'pe-details-toggle';
      detailsToggle.textContent = 'Show details';

      var detailsBox = document.createElement('pre');
      detailsBox.className = 'pe-details-box';
      detailsBox.textContent = detailText;
      detailsBox.style.display = 'none';

      detailsToggle.addEventListener('click', function () {
        var isHidden = detailsBox.style.display === 'none';
        detailsBox.style.display = isHidden ? 'block' : 'none';
        detailsToggle.textContent = isHidden ? 'Hide details' : 'Show details';
      });

      containerElement.appendChild(detailsToggle);
      containerElement.appendChild(detailsBox);
    }

    containerElement.classList.add('pe-visible');

    var timeoutMs = (globalThis.PE.C && globalThis.PE.C.LIMITS && globalThis.PE.C.LIMITS.TOAST_ERROR_MS) || 10000;
    autoHideTimer = setTimeout(function () {
      ui.hide();
    }, timeoutMs);
  };

  /**
   * Display the stale editor warning when draft text was modified during enhancement.
   * Offers "Insert anyway" and "Copy" actions (Edge Case E7 & Section 7.6).
   * @param {Object} options
   * @param {Element} [options.targetEl]
   * @param {string} [options.message]
   * @param {Function} [options.onInsertAnyway]
   * @param {Function} [options.onCopy]
   * @param {Function} [options.onClose]
   */
  ui.showStaleWarning = function (options) {
    clearAutoHide();
    clearBusyTarget();
    ensureHost();

    options = options || {};
    var targetEl = options.targetEl;
    var messageText = options.message || 'The text changed while enhancing.';
    var onInsertAnyway = options.onInsertAnyway;
    var onCopy = options.onCopy;
    var onClose = options.onClose;

    containerElement.textContent = '';
    positionToast(targetEl);

    var header = document.createElement('div');
    header.className = 'pe-toast-header';

    var content = document.createElement('div');
    content.className = 'pe-toast-content';

    var icon = document.createElement('span');
    icon.className = 'pe-icon-warn';
    icon.textContent = '⚠';
    content.appendChild(icon);

    var msg = document.createElement('span');
    msg.className = 'pe-toast-message';
    msg.textContent = messageText;
    content.appendChild(msg);

    header.appendChild(content);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pe-btn pe-btn-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', function () {
      ui.hide();
      if (typeof onClose === 'function') {
        onClose();
      }
    });
    header.appendChild(closeBtn);

    containerElement.appendChild(header);

    // Action buttons row (Insert anyway / Copy)
    var actionsRow = document.createElement('div');
    actionsRow.className = 'pe-toast-actions';

    var insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.className = 'pe-btn pe-btn-insert-anyway';
    insertBtn.textContent = 'Insert anyway';
    insertBtn.addEventListener('click', function () {
      ui.hide();
      if (typeof onInsertAnyway === 'function') {
        onInsertAnyway();
      }
    });
    actionsRow.appendChild(insertBtn);

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'pe-btn pe-btn-copy-stale';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', function () {
      if (typeof onCopy === 'function') {
        onCopy();
      }
    });
    actionsRow.appendChild(copyBtn);

    containerElement.appendChild(actionsRow);
    containerElement.classList.add('pe-visible');

    // Auto-hide after 15 seconds if not acted upon
    var timeoutMs = 15000;
    autoHideTimer = setTimeout(function () {
      ui.hide();
    }, timeoutMs);
  };

  // ---------------------------------------------------------------------------
  // Floating Prompt Card API (Directly Above Input Field)
  // ---------------------------------------------------------------------------
  function removePromptCard() {
    if (cleanPromptCardListeners) {
      try { cleanPromptCardListeners(); } catch (e) {}
      cleanPromptCardListeners = null;
    }
    if (promptCardElement) {
      try { promptCardElement.remove(); } catch (e) {}
      promptCardElement = null;
    }
  }

  ui.hidePromptCard = function () {
    removePromptCard();
  };

  /**
   * Display the enhanced prompt inside a floating preview card directly ABOVE the input field.
   * Gives the user the choice to review, copy, or click Insert to fill the chat box.
   *
   * @param {Object} options
   * @param {Element} options.targetEl - Editable input target
   * @param {string} options.text - Enhanced prompt or grammar-corrected text
   * @param {string} [options.originalText] - Original draft
   * @param {string} [options.mode] - 'enhance' or 'grammar'
   * @param {boolean} [options.contextUsed] - Whether conversation context was incorporated
   * @param {Function} [options.onInsert] - Callback when user clicks Insert
   * @param {Function} [options.onClose] - Callback when user closes without inserting
   */
  ui.showPromptCard = function (options) {
    clearAutoHide();
    clearBusyTarget();
    removePromptCard();
    ensureHost();

    options = options || {};
    var targetEl = options.targetEl;
    var text = options.text || '';
    var mode = options.mode || 'enhance';
    var onInsert = options.onInsert;
    var onClose = options.onClose;

    var hostBox = findOuterInputContainer(targetEl) || targetEl;

    var card = document.createElement('div');
    card.className = 'pe-prompt-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', mode === 'grammar' ? 'Grammar Correction Preview' : 'Enhanced Prompt Preview');

    function updateCardPosition() {
      if (!hostBox || !hostBox.isConnected || !card) return;
      try {
        var rect = hostBox.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          rect = targetEl.getBoundingClientRect();
        }
        if (rect.width <= 0 || rect.height <= 0) return;

        // Position 12px ABOVE the top of the outer input pill bar
        var bottomDist = Math.max(16, window.innerHeight - rect.top + 12);
        card.style.bottom = bottomDist + 'px';

        // Center card horizontally over the input bar
        var cardWidth = Math.min(Math.max(rect.width, 360), 780);
        var leftDist = Math.round(rect.left + (rect.width - cardWidth) / 2);
        if (leftDist < 16) leftDist = 16;
        if (leftDist + cardWidth > window.innerWidth - 16) {
          cardWidth = Math.max(300, window.innerWidth - 32);
          leftDist = 16;
        }

        card.style.left = leftDist + 'px';
        card.style.width = cardWidth + 'px';
      } catch (e) {}
    }

    updateCardPosition();

    // 1. Top Bar
    var topbar = document.createElement('div');
    topbar.className = 'pe-card-topbar';

    var titleGroup = document.createElement('div');
    titleGroup.className = 'pe-card-title-group';

    var badge = document.createElement('span');
    badge.className = 'pe-card-badge';
    var iconSvg = (mode === 'grammar')
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><defs><linearGradient id="cardPenGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FDA4AF"/><stop offset="100%" stop-color="#F43F5E"/></linearGradient></defs><path d="M12 20h9" stroke="#FDA4AF" stroke-width="1.8" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="url(#cardPenGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="url(#cardPenGrad)" fill-opacity="0.18"/><circle cx="17.5" cy="5" r="1" fill="#FDE047"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><defs><linearGradient id="cardWandGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#C084FC"/><stop offset="100%" stop-color="#6366F1"/></linearGradient></defs><path d="M4 20l9-9" stroke="url(#cardWandGrad)" stroke-width="2.2" stroke-linecap="round"/><path d="M13 11l-1-1L15.5 6.5l2 2L14 12l-1-1z" fill="url(#cardWandGrad)"/><path d="M19 2l.5 1.2L20.7 3.7l-1.2.5L19 5.4l-.5-1.2L17.3 3.7l1.2-.5L19 2z" fill="#FDE047"/></svg>';
    var titleLabel = (mode === 'grammar') ? 'Corrected Grammar' : 'Enhanced Prompt';
    badge.innerHTML = iconSvg + '<span>' + titleLabel + '</span>';
    titleGroup.appendChild(badge);

    var wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    var metaSpan = document.createElement('span');
    metaSpan.className = 'pe-card-meta';
    metaSpan.textContent = wordCount + ' words · ' + text.length + ' chars';
    titleGroup.appendChild(metaSpan);

    topbar.appendChild(titleGroup);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pe-btn pe-btn-close';
    closeBtn.setAttribute('aria-label', 'Close preview');
    closeBtn.title = 'Close (Esc)';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.addEventListener('click', function () {
      removePromptCard();
      if (typeof onClose === 'function') onClose();
    });
    topbar.appendChild(closeBtn);

    card.appendChild(topbar);

    // 2. Body Area (The Text)
    var body = document.createElement('div');
    body.className = 'pe-card-body';
    body.textContent = text;
    card.appendChild(body);

    // 3. Footer Bar with Actions
    var footer = document.createElement('div');
    footer.className = 'pe-card-footer';

    var hint = document.createElement('span');
    hint.className = 'pe-card-hint';
    hint.textContent = 'Press Ctrl+Enter to insert';
    footer.appendChild(hint);

    var actions = document.createElement('div');
    actions.className = 'pe-card-actions';

    var copySvgDefault = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><defs><linearGradient id="cardCopyGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38BDF8"/><stop offset="100%" stop-color="#06B6D4"/></linearGradient></defs><rect x="9" y="9" width="13" height="13" rx="2.5" fill="url(#cardCopyGrad)" fill-opacity="0.18" stroke="url(#cardCopyGrad)" stroke-width="1.8"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="#38BDF8" stroke-width="1.8" stroke-linecap="round"/></svg>';
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'pe-btn-copy-main';
    copyBtn.innerHTML = copySvgDefault + '<span>Copy</span>';
    copyBtn.addEventListener('click', function () {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.innerHTML = '<svg viewBox="0 0 20 20" width="13" height="13" fill="none"><defs><linearGradient id="copiedGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34D399"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><circle cx="10" cy="10" r="9" fill="url(#copiedGrad)" fill-opacity="0.22" stroke="url(#copiedGrad)" stroke-width="1.8"/><path d="M6 10.2l2.6 2.6 5.4-5.6" stroke="#34D399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span style="color:#34D399">Copied!</span>';
          setTimeout(function () {
            copyBtn.innerHTML = copySvgDefault + '<span>Copy</span>';
          }, 2000);
        });
      }
    });
    actions.appendChild(copyBtn);

    var insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.className = 'pe-btn-insert-main';
    insertBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><defs><linearGradient id="cardInsertGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34D399"/><stop offset="100%" stop-color="#10B981"/></linearGradient></defs><path d="M12 4v14M19 11l-7 7-7-7" stroke="url(#cardInsertGrad)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Insert into Chat</span>';
    insertBtn.addEventListener('click', function () {
      removePromptCard();
      if (typeof onInsert === 'function') {
        onInsert(text);
      }
    });
    actions.appendChild(insertBtn);

    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'pe-btn-dismiss-main';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.addEventListener('click', function () {
      removePromptCard();
      if (typeof onClose === 'function') onClose();
    });
    actions.appendChild(dismissBtn);

    footer.appendChild(actions);
    card.appendChild(footer);

    shadowRoot.appendChild(card);

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        if (card) card.classList.add('pe-visible');
      });
    } else {
      card.classList.add('pe-visible');
    }

    promptCardElement = card;

    // Listeners for repositioning and Esc / Ctrl+Enter
    var onReposition = function () {
      updateCardPosition();
    };

    var onKey = function (e) {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        removePromptCard();
        if (typeof onClose === 'function') onClose();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.code === 'Enter')) {
        e.preventDefault();
        removePromptCard();
        if (typeof onInsert === 'function') onInsert(text);
      }
    };

    window.addEventListener('scroll', onReposition, { passive: true, capture: true });
    window.addEventListener('resize', onReposition, { passive: true });
    window.addEventListener('keydown', onKey, true);

    cleanPromptCardListeners = function () {
      window.removeEventListener('scroll', onReposition, { capture: true });
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('keydown', onKey, true);
    };
  };

  /**
   * Hide the active overlay notification and clean up state.
   */
  ui.hide = function () {
    clearAutoHide();
    clearBusyTarget();
    removePromptCard();
    if (containerElement) {
      containerElement.classList.remove('pe-visible');
    }
  };

  ui.__getContainer = function () {
    return containerElement;
  };

  globalThis.PE.ui = ui;

}());
