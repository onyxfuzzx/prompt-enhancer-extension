// stats-overlay.js — Prompt Enhancer
// In-page floating statistics, conversation metrics, and session limit overlay.
// Injected into AI chat sites (Claude, ChatGPT, Gemini, Perplexity, DeepSeek).
// Renders inside an isolated Shadow DOM for zero style collision.
// Clean, minimal, native aesthetic (Apple / Linear / Raycast style).

/* global globalThis, chrome */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Double-Injection Guard
  // ---------------------------------------------------------------------------
  if (globalThis.PE && globalThis.PE.__statsOverlayLoaded) {
    return;
  }
  globalThis.PE = globalThis.PE || {};
  globalThis.PE.__statsOverlayLoaded = true;

  var PE = globalThis.PE;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var hostElement = null;
  var shadowRoot = null;
  var cardElement = null;
  var mutationObserver = null;
  var timerInterval = null;
  var pollInterval = null;
  var debounceTimeout = null;

  var state = {
    collapsed: false,
    visible: true,
    position: 'right', // 'right' (top-right mark) or 'left' (top-left mark)
    activeLimitMode: 'session', // 'session' | 'weekly' | 'daily'
    modelName: 'Auto Detect',
    manualModel: null,
    conversationTokens: 0,
    conversationTurns: 0,
    conversationChars: 0,
    costUSD: 0,
    costCredits: 0,
    sessionStart: 0,
    sessionDurationMs: 5 * 60 * 60 * 1000, // 5 hours rolling window
    backgroundStats: null,
    backgroundLimits: null,
    configuredModel: '',
    pricing: {}
  };

  // ---------------------------------------------------------------------------
  // Load Persisted Session & Position State
  // ---------------------------------------------------------------------------
  try {
    var storedStart = window.sessionStorage ? window.sessionStorage.getItem('pe_session_start') : null;
    if (storedStart) {
      state.sessionStart = parseInt(storedStart, 10);
    }
    if (!state.sessionStart || isNaN(state.sessionStart) || Date.now() - state.sessionStart > state.sessionDurationMs) {
      state.sessionStart = Date.now();
      if (window.sessionStorage) {
        window.sessionStorage.setItem('pe_session_start', String(state.sessionStart));
      }
    }

    var storedPos = window.localStorage ? window.localStorage.getItem('pe_stats_position') : null;
    if (storedPos === 'left' || storedPos === 'right') {
      state.position = storedPos;
    } else {
      state.position = 'right'; // Default to top-right mark
    }

    var storedCollapsed = window.localStorage ? window.localStorage.getItem('pe_stats_collapsed') : null;
    if (storedCollapsed === 'true') {
      state.collapsed = true;
    }

    var storedMode = window.localStorage ? window.localStorage.getItem('pe_stats_mode') : null;
    if (storedMode && (storedMode === 'session' || storedMode === 'weekly' || storedMode === 'daily')) {
      state.activeLimitMode = storedMode;
    }

    var storedManual = window.localStorage ? window.localStorage.getItem('pe_custom_model') : null;
    if (storedManual && storedManual.trim()) {
      state.manualModel = storedManual.trim();
    }
  } catch (e) {
    state.sessionStart = Date.now();
    state.position = 'right';
  }

  // ---------------------------------------------------------------------------
  // SVGs (Zero-Emoji Policy, Clean Minimal Geometry)
  // ---------------------------------------------------------------------------
  var ICONS = {
    SWAP: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>',
    REFRESH: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>',
    CHEVRON_UP: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
    CHEVRON_DOWN: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    CLOSE: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    SPARKLE: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>'
  };

  // ---------------------------------------------------------------------------
  // Shadow DOM Stylesheet — Understated, Sleek, Native Dark Theme
  // ---------------------------------------------------------------------------
  var STYLES = [
    ':host {',
    '  all: initial;',
    '  font-size: 12px;',
    '  line-height: 1.4;',
    '  z-index: 2147483646;',
    '  pointer-events: none;',
    '}',
    '*, *::before, *::after {',
    '  box-sizing: border-box;',
    '}',

    // =========================================================================
    // Base Tokens (Fallback / Default)
    // =========================================================================
    '.pe-stats-card {',
    '  --pe-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '  --pe-bg: rgba(20, 22, 28, 0.94);',
    '  --pe-bg-hover: rgba(255, 255, 255, 0.08);',
    '  --pe-border: rgba(255, 255, 255, 0.08);',
    '  --pe-border-hover: rgba(255, 255, 255, 0.16);',
    '  --pe-text-primary: #f1f5f9;',
    '  --pe-text-secondary: #94a3b8;',
    '  --pe-text-muted: #64748b;',
    '  --pe-accent: #6366f1;',
    '  --pe-accent-soft: rgba(99, 102, 241, 0.15);',
    '  --pe-status-dot: #34d399;',
    '  --pe-shadow: 0 10px 30px -4px rgba(0, 0, 0, 0.55), 0 0 1px rgba(255, 255, 255, 0.12);',
    '  --pe-radius: 14px;',
    '}',

    // =========================================================================
    // Gemini Theme (Google Material 3 Expressive, Google Sans, Light Blue / Blue)
    // =========================================================================
    '.pe-stats-card.theme-gemini {',
    '  --pe-font: "Google Sans", "Google Sans Flex", Roboto, -apple-system, BlinkMacSystemFont, sans-serif;',
    '  --pe-bg: rgba(30, 31, 32, 0.94);',
    '  --pe-bg-hover: rgba(45, 47, 50, 0.9);',
    '  --pe-border: rgba(68, 71, 70, 0.7);',
    '  --pe-border-hover: rgba(168, 199, 250, 0.4);',
    '  --pe-text-primary: #e3e3e3;',
    '  --pe-text-secondary: #c4c7c5;',
    '  --pe-text-muted: #8e918f;',
    '  --pe-accent: #a8c7fa;',
    '  --pe-accent-soft: rgba(168, 199, 250, 0.14);',
    '  --pe-status-dot: #a8c7fa;',
    '  --pe-shadow: 0 12px 36px rgba(0, 0, 0, 0.55), 0 1px 3px rgba(0, 0, 0, 0.4);',
    '  --pe-radius: 16px;',
    '}',
    '.pe-stats-card.theme-gemini.mode-light {',
    '  --pe-bg: rgba(255, 255, 255, 0.96);',
    '  --pe-bg-hover: rgba(240, 244, 249, 0.95);',
    '  --pe-border: rgba(224, 226, 224, 0.9);',
    '  --pe-border-hover: rgba(11, 87, 208, 0.4);',
    '  --pe-text-primary: #1f1f1f;',
    '  --pe-text-secondary: #444746;',
    '  --pe-text-muted: #747775;',
    '  --pe-accent: #0b57d0;',
    '  --pe-accent-soft: rgba(11, 87, 208, 0.10);',
    '  --pe-status-dot: #0b57d0;',
    '  --pe-shadow: 0 8px 24px rgba(0, 0, 0, 0.10), 0 1px 3px rgba(0, 0, 0, 0.08);',
    '}',

    // =========================================================================
    // Claude Theme (Warm Charcoal, Terracotta / Clay Accent, Editorial Inter)
    // =========================================================================
    '.pe-stats-card.theme-claude {',
    '  --pe-font: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  --pe-bg: rgba(38, 37, 35, 0.94);',
    '  --pe-bg-hover: rgba(54, 52, 49, 0.9);',
    '  --pe-border: rgba(255, 255, 255, 0.09);',
    '  --pe-border-hover: rgba(217, 130, 98, 0.4);',
    '  --pe-text-primary: #ece8e1;',
    '  --pe-text-secondary: #b0aba0;',
    '  --pe-text-muted: #7d7971;',
    '  --pe-accent: #d98262;',
    '  --pe-accent-soft: rgba(217, 130, 98, 0.14);',
    '  --pe-status-dot: #d98262;',
    '  --pe-shadow: 0 12px 36px rgba(18, 17, 16, 0.65), 0 1px 2px rgba(217, 130, 98, 0.1);',
    '  --pe-radius: 12px;',
    '}',
    '.pe-stats-card.theme-claude.mode-light {',
    '  --pe-bg: rgba(255, 255, 255, 0.96);',
    '  --pe-bg-hover: rgba(245, 243, 239, 0.95);',
    '  --pe-border: rgba(0, 0, 0, 0.09);',
    '  --pe-border-hover: rgba(204, 120, 92, 0.45);',
    '  --pe-text-primary: #18181b;',
    '  --pe-text-secondary: #6b6863;',
    '  --pe-text-muted: #96938d;',
    '  --pe-accent: #cc785c;',
    '  --pe-accent-soft: rgba(204, 120, 92, 0.12);',
    '  --pe-status-dot: #cc785c;',
    '  --pe-shadow: 0 8px 24px rgba(45, 40, 35, 0.08), 0 1px 2px rgba(0, 0, 0, 0.05);',
    '}',

    // =========================================================================
    // ChatGPT Theme (Söhne / ui-sans-serif, OpenAI Neutral Dark & Emerald)
    // =========================================================================
    '.pe-stats-card.theme-chatgpt {',
    '  --pe-font: "Söhne", "ui-sans-serif", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  --pe-bg: rgba(33, 33, 33, 0.94);',
    '  --pe-bg-hover: rgba(47, 47, 47, 0.95);',
    '  --pe-border: rgba(255, 255, 255, 0.10);',
    '  --pe-border-hover: rgba(16, 163, 127, 0.4);',
    '  --pe-text-primary: #ececec;',
    '  --pe-text-secondary: #b4b4b4;',
    '  --pe-text-muted: #8e8e8e;',
    '  --pe-accent: #10a37f;',
    '  --pe-accent-soft: rgba(16, 163, 127, 0.14);',
    '  --pe-status-dot: #10a37f;',
    '  --pe-shadow: 0 12px 34px rgba(0, 0, 0, 0.55), 0 0 1px rgba(255, 255, 255, 0.1);',
    '  --pe-radius: 16px;',
    '}',
    '.pe-stats-card.theme-chatgpt.mode-light {',
    '  --pe-bg: rgba(255, 255, 255, 0.96);',
    '  --pe-bg-hover: rgba(247, 247, 248, 0.96);',
    '  --pe-border: rgba(0, 0, 0, 0.10);',
    '  --pe-border-hover: rgba(16, 163, 127, 0.45);',
    '  --pe-text-primary: #0d0d0d;',
    '  --pe-text-secondary: #676767;',
    '  --pe-text-muted: #8e8e8e;',
    '  --pe-accent: #10a37f;',
    '  --pe-accent-soft: rgba(16, 163, 127, 0.12);',
    '  --pe-status-dot: #10a37f;',
    '  --pe-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);',
    '}',

    // =========================================================================
    // Main Card Geometry & Layout (Consuming CSS Custom Properties)
    // =========================================================================
    '.pe-stats-card {',
    '  position: fixed;',
    '  top: 76px;',
    '  z-index: 2147483646;',
    '  width: 350px;',
    '  font-family: var(--pe-font);',
    '  background: var(--pe-bg);',
    '  backdrop-filter: blur(20px);',
    '  -webkit-backdrop-filter: blur(20px);',
    '  border: 1px solid var(--pe-border);',
    '  border-radius: var(--pe-radius);',
    '  box-shadow: var(--pe-shadow);',
    '  padding: 12px 14px;',
    '  color: var(--pe-text-primary);',
    '  pointer-events: auto;',
    '  user-select: none;',
    '  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s, box-shadow 0.15s, background-color 0.2s;',
    '}',
    '.pe-stats-card:hover {',
    '  border-color: var(--pe-border-hover);',
    '}',

    // Position Anchors (Right mark / Left mark)
    '.pe-stats-card.pe-pos-right {',
    '  right: 28px;',
    '  left: auto;',
    '}',
    '.pe-stats-card.pe-pos-left {',
    '  left: 28px;',
    '  right: auto;',
    '}',

    // Hidden State
    '.pe-stats-card.pe-hidden {',
    '  opacity: 0;',
    '  transform: translateY(-8px) scale(0.97);',
    '  pointer-events: none;',
    '}',

    // Card Header Row: Model, Tokens, Quick Actions
    '.pe-card-header {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  gap: 10px;',
    '  margin-bottom: 10px;',
    '}',
    '.pe-header-left {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  overflow: hidden;',
    '}',
    '.pe-model-badge {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  font-family: var(--pe-font);',
    '  background: var(--pe-bg-hover);',
    '  border: 1px solid var(--pe-border);',
    '  border-radius: calc(var(--pe-radius) - 8px);',
    '  padding: 3px 8px;',
    '  font-size: 11px;',
    '  font-weight: 500;',
    '  color: var(--pe-text-primary);',
    '  white-space: nowrap;',
    '  max-width: 140px;',
    '  text-overflow: ellipsis;',
    '  overflow: hidden;',
    '  transition: background-color 0.15s, border-color 0.15s;',
    '}',
    '.pe-model-badge:hover {',
    '  border-color: var(--pe-border-hover);',
    '}',
    '.pe-status-dot {',
    '  width: 6px;',
    '  height: 6px;',
    '  border-radius: 50%;',
    '  background: var(--pe-status-dot);',
    '  box-shadow: 0 0 6px var(--pe-accent-soft);',
    '  flex-shrink: 0;',
    '}',
    '.pe-token-summary {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 4px;',
    '  font-size: 11px;',
    '  color: var(--pe-text-secondary);',
    '  white-space: nowrap;',
    '}',
    '.pe-token-count {',
    '  color: var(--pe-text-primary);',
    '  font-weight: 600;',
    '}',
    '.pe-token-unit {',
    '  color: var(--pe-text-muted);',
    '}',
    '.pe-cost-val {',
    '  color: var(--pe-text-secondary);',
    '  font-weight: 500;',
    '}',
    '.pe-dot-sep {',
    '  color: var(--pe-text-muted);',
    '  font-size: 10px;',
    '  opacity: 0.6;',
    '}',

    // Header Actions
    '.pe-header-actions {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 2px;',
    '  flex-shrink: 0;',
    '}',
    '.pe-btn-icon {',
    '  all: unset;',
    '  cursor: pointer;',
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  width: 22px;',
    '  height: 22px;',
    '  border-radius: 5px;',
    '  color: var(--pe-text-muted);',
    '  transition: color 0.15s, background-color 0.15s;',
    '}',
    '.pe-btn-icon:hover {',
    '  color: var(--pe-text-primary);',
    '  background: var(--pe-bg-hover);',
    '}',

    // Card Body: Limits & Progress
    '.pe-card-body {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 8px;',
    '}',
    '.pe-limit-row {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  gap: 8px;',
    '}',
    '.pe-limit-pills {',
    '  display: flex;',
    '  align-items: center;',
    '  background: var(--pe-bg-hover);',
    '  border-radius: calc(var(--pe-radius) - 8px);',
    '  padding: 2px;',
    '}',
    '.pe-pill-tab {',
    '  all: unset;',
    '  cursor: pointer;',
    '  font-family: var(--pe-font);',
    '  font-size: 11px;',
    '  font-weight: 500;',
    '  color: var(--pe-text-muted);',
    '  padding: 2px 7px;',
    '  border-radius: calc(var(--pe-radius) - 10px);',
    '  transition: color 0.15s, background-color 0.15s;',
    '}',
    '.pe-pill-tab:hover {',
    '  color: var(--pe-text-primary);',
    '}',
    '.pe-pill-tab.pe-active {',
    '  color: var(--pe-text-primary);',
    '  background: var(--pe-accent-soft);',
    '  font-weight: 600;',
    '}',
    '.pe-metric-meta {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 5px;',
    '  font-size: 11px;',
    '  color: var(--pe-text-secondary);',
    '  white-space: nowrap;',
    '}',
    '.pe-meta-pct {',
    '  color: var(--pe-accent);',
    '  font-weight: 600;',
    '}',
    '.pe-meta-reset {',
    '  color: var(--pe-text-secondary);',
    '}',
    '.pe-meta-left {',
    '  color: var(--pe-text-muted);',
    '}',

    // Slender, Minimalist Progress Meter
    '.pe-meter-container {',
    '  width: 100%;',
    '}',
    '.pe-meter-track {',
    '  position: relative;',
    '  width: 100%;',
    '  height: 4px;',
    '  background: var(--pe-bg-hover);',
    '  border-radius: 9999px;',
    '  overflow: visible;',
    '}',
    '.pe-meter-bar {',
    '  height: 100%;',
    '  border-radius: 9999px;',
    '  background: var(--pe-accent);',
    '  box-shadow: 0 0 8px var(--pe-accent-soft);',
    '  transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s;',
    '}',
    '.pe-meter-bar.pe-warn {',
    '  background: #f59e0b;',
    '  box-shadow: 0 0 8px rgba(245, 158, 11, 0.35);',
    '}',
    '.pe-meter-marker {',
    '  position: absolute;',
    '  top: -2px;',
    '  width: 2px;',
    '  height: 8px;',
    '  border-radius: 1px;',
    '  background: var(--pe-text-muted);',
    '  opacity: 0.5;',
    '  transform: translateX(-50%);',
    '}',

    // Collapsed Mini Pill Mode
    '.pe-card-collapsed-view {',
    '  display: none;',
    '  align-items: center;',
    '  gap: 8px;',
    '  font-family: var(--pe-font);',
    '  font-size: 11px;',
    '  color: var(--pe-text-secondary);',
    '  white-space: nowrap;',
    '}',
    '.pe-mini-val {',
    '  color: var(--pe-text-primary);',
    '}',
    '.pe-mini-actions {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 2px;',
    '  margin-left: 2px;',
    '}',

    // Toggle Collapsed Class
    '.pe-stats-card.pe-collapsed {',
    '  width: auto;',
    '  padding: 6px 10px 6px 12px;',
    '  border-radius: 9999px;',
    '}',
    '.pe-stats-card.pe-collapsed .pe-card-header,',
    '.pe-stats-card.pe-collapsed .pe-card-body {',
    '  display: none;',
    '}',
    '.pe-stats-card.pe-collapsed .pe-card-collapsed-view {',
    '  display: flex;',
    '}',

    // Responsive Mobile
    '@media (max-width: 640px) {',
    '  .pe-stats-card {',
    '    top: auto;',
    '    bottom: 80px;',
    '    right: 12px !important;',
    '    left: 12px !important;',
    '    width: auto;',
    '  }',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Helper: Model Pricing Matcher
  // ---------------------------------------------------------------------------
  function getModelPricePerMillion(modelName) {
    if (!modelName) return 3.0;
    var pricing = state.pricing || (PE.C && PE.C.MODEL_PRICING) || {};
    var nameLower = modelName.toLowerCase();

    var bestMatch = null;
    var bestLen = 0;
    for (var key in pricing) {
      if (Object.prototype.hasOwnProperty.call(pricing, key)) {
        if (nameLower.indexOf(key.toLowerCase()) !== -1 && key.length > bestLen) {
          bestMatch = pricing[key];
          bestLen = key.length;
        }
      }
    }

    if (bestMatch && typeof bestMatch.input === 'number') {
      return (bestMatch.input + (bestMatch.output || bestMatch.input)) / 2;
    }

    if (nameLower.indexOf('opus') !== -1) return 25.0;
    if (nameLower.indexOf('sonnet') !== -1) return 3.75;
    if (nameLower.indexOf('haiku') !== -1) return 0.50;
    if (nameLower.indexOf('o1') !== -1) return 30.0;
    if (nameLower.indexOf('gpt-4o') !== -1) return 5.0;
    if (nameLower.indexOf('gpt-4') !== -1) return 15.0;
    if (nameLower.indexOf('argon') !== -1) return 6.25;
    if (nameLower.indexOf('gemini') !== -1) return 2.0;

    return 3.0;
  }

  // ---------------------------------------------------------------------------
  // Helper: Detect Active Model from Page DOM (Clean, Excludes Textareas/Prompts)
  // ---------------------------------------------------------------------------
  function detectActiveModelFromPage() {
    try {
      if (state.manualModel && state.manualModel.trim()) {
        return state.manualModel.trim();
      }

      var hostname = window.location.hostname || '';

      // 1. Gemini (gemini.google.com)
      if (/gemini\.google\.com/i.test(hostname)) {
        // A. Primary check: Search for Argon and thinking level
        var geminiControls = document.querySelectorAll(
          'bard-model-switcher, [data-test-id*="model"], [data-test-id*="switcher"], ' +
          '[data-model*="argon"], [data-model-id*="argon"], [aria-label*="argon" i], ' +
          '.input-area button, [class*="input-area"] button, [class*="toolbar"] button, [class*="composer"] button, ' +
          'rich-textarea ~ * button, button, [role="button"], [role="combobox"], [aria-haspopup="menu"], ' +
          '.model-name, .model-title, [class*="model"], [class*="thinking"], [class*="badge"]'
        );

        var detectedArgon = false;
        var argonThinking = '';

        for (var i = 0; i < geminiControls.length; i++) {
          var cEl = geminiControls[i];
          var aria = (cEl.getAttribute('aria-label') || '').toLowerCase();
          if (/prompt|type|enter\s+a|send|microphone|attachment|upload/i.test(aria)) continue;
          if (cEl.tagName === 'TEXTAREA' || cEl.isContentEditable) continue;

          var cText = (cEl.textContent || '').trim();
          if (!cText || cText.length > 50) continue;
          if (/prompt|enter\s+a\s+prompt|send/i.test(cText)) continue;

          var combined = (cText + ' ' + aria).toLowerCase();

          if (combined.indexOf('argon') !== -1) {
            detectedArgon = true;
            if (/\bhigh\b/i.test(combined)) {
              argonThinking = 'High';
            } else if (/\bmedium\b|\bmed\b/i.test(combined)) {
              argonThinking = 'Med';
            } else if (/\blow\b/i.test(combined)) {
              argonThinking = 'Low';
            }

            if (!argonThinking && cEl.parentElement) {
              var parentText = (cEl.parentElement.textContent || '').toLowerCase();
              if (/\bhigh\b/i.test(parentText)) {
                argonThinking = 'High';
              } else if (/\bmedium\b|\bmed\b/i.test(parentText)) {
                argonThinking = 'Med';
              } else if (/\blow\b/i.test(parentText)) {
                argonThinking = 'Low';
              }
            }
          }
        }

        // Check entire composer/input bar area for Argon
        if (!detectedArgon) {
          var inputArea = document.querySelector('.input-area, [class*="input-area"], .chat-input-container, rich-textarea');
          if (inputArea) {
            var inputAreaBtns = inputArea.querySelectorAll('button, [role="button"], span');
            for (var ib = 0; ib < inputAreaBtns.length; ib++) {
              var ibTxt = (inputAreaBtns[ib].textContent || '').trim().toLowerCase();
              if (ibTxt.indexOf('argon') !== -1) {
                detectedArgon = true;
                if (/\bhigh\b/i.test(ibTxt)) argonThinking = 'High';
                break;
              }
            }
          }
        }

        // Also check document title
        if (!detectedArgon && /argon/i.test(document.title)) {
          detectedArgon = true;
          if (/high/i.test(document.title)) argonThinking = 'High';
        }

        // If Argon is detected:
        if (detectedArgon) {
          if (!argonThinking) {
            var allBadges = document.querySelectorAll('button, [role="button"], span.badge, [class*="thinking"]');
            for (var ab = 0; ab < allBadges.length; ab++) {
              var bTxt = (allBadges[ab].textContent || '').toLowerCase();
              if (/\bhigh\b/i.test(bTxt) && bTxt.length < 20) {
                argonThinking = 'High';
                break;
              }
            }
          }
          return argonThinking ? ('Argon (' + argonThinking + ')') : 'Argon (High)';
        }

        // B. Check for other explicit Gemini models
        for (var j = 0; j < geminiControls.length; j++) {
          var mEl = geminiControls[j];
          var mText = (mEl.textContent || '').trim();
          if (!mText || mText.length > 35) continue;
          if (/prompt|enter|type|input|message|send/i.test(mText)) continue;

          var gMatch = mText.match(/\b(Gemini\s*(?:2\.0\s*Flash|2\.0\s*Pro|1\.5\s*Pro|1\.5\s*Flash|Advanced|Ultra|Flash|Pro)?|Flash|Pro|Advanced)\b/i);
          if (gMatch && gMatch[0].length > 2) {
            return gMatch[0].trim();
          }
        }

        if (state.configuredModel && state.configuredModel.trim()) {
          return state.configuredModel;
        }

        return 'Gemini 1.5 Pro';
      }

      // 2. Claude (claude.ai)
      if (/claude\.ai/i.test(hostname)) {
        var claudeBtns = document.querySelectorAll('button:not([aria-label*="Send"]):not([aria-label*="Upload"])');
        for (var c = 0; c < claudeBtns.length; c++) {
          var cTxt = (claudeBtns[c].textContent || '').trim();
          if (/\b(Opus|Sonnet|Haiku)\b/i.test(cTxt) && cTxt.length < 30 && !/prompt|enter|reply|message/i.test(cTxt)) {
            return cTxt.replace(/\s+/g, ' ');
          }
        }
        return 'Claude 3.5 Sonnet';
      }

      // 3. ChatGPT (chatgpt.com / chat.openai.com)
      if (/chatgpt\.com|chat\.openai\.com/i.test(hostname)) {
        var switcher = document.querySelector('[data-testid="model-switcher-dropdown"]');
        if (switcher) {
          var sText = (switcher.textContent || '').trim();
          if (sText && sText.length < 25 && !/prompt|search|type/i.test(sText)) {
            return sText;
          }
        }
        var gptButtons = document.querySelectorAll('button');
        for (var g = 0; g < gptButtons.length; g++) {
          var bText = (gptButtons[g].textContent || '').trim();
          if (/^(ChatGPT|GPT-4o|GPT-4|o1-preview|o1-mini|o1)\b/i.test(bText)) {
            return bText;
          }
        }
        return 'GPT-4o';
      }

      // 4. Perplexity / DeepSeek
      if (/perplexity\.ai/i.test(hostname)) return 'Perplexity Pro';
      if (/deepseek\.com/i.test(hostname)) return 'DeepSeek Chat';

    } catch (e) {}

    return state.configuredModel || 'Claude 3.5 Sonnet';
  }

  // ---------------------------------------------------------------------------
  // Helper: Format Numbers and Tokens
  // ---------------------------------------------------------------------------
  function formatTokens(count) {
    if (count == null || isNaN(count)) return '0';
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return String(count);
  }

  function formatCost(usd) {
    if (usd == null || isNaN(usd) || usd <= 0) return '$0.000';
    if (usd < 0.001) return '< $0.001';
    return '$' + usd.toFixed(3);
  }

  // ---------------------------------------------------------------------------
  // Recalculate Conversation Tokens from DOM
  // ---------------------------------------------------------------------------
  function recalculatePageTokens() {
    try {
      var adapter = (PE.sites && typeof PE.sites.forLocation === 'function')
        ? PE.sites.forLocation(window.location)
        : null;

      var selectors = (adapter && adapter.turnSelectors) ? adapter.turnSelectors : [
        '[data-message-author-role]',
        '[data-message-id]',
        'article',
        'user-query',
        'model-response',
        '.font-user-message',
        '.font-claude-message',
        '[data-is-user="true"]'
      ];

      var foundElements = [];
      for (var s = 0; s < selectors.length; s++) {
        var matches = document.querySelectorAll(selectors[s]);
        for (var m = 0; m < matches.length; m++) {
          if (foundElements.indexOf(matches[m]) === -1) {
            foundElements.push(matches[m]);
          }
        }
      }

      var totalChars = 0;
      var turnCount = 0;
      for (var i = 0; i < foundElements.length; i++) {
        var text = (foundElements[i].textContent || '').trim();
        if (text.length > 2) {
          totalChars += text.length;
          turnCount++;
        }
      }

      state.conversationChars = totalChars;
      state.conversationTurns = turnCount;
      state.conversationTokens = Math.round(totalChars / 4);

      // Detect active model
      state.modelName = detectActiveModelFromPage();

      // Estimate Cost USD
      var pricePerMillion = getModelPricePerMillion(state.modelName);
      state.costUSD = (state.conversationTokens / 1000000) * pricePerMillion;
      state.costCredits = state.costUSD * 1000;

      // Update Card
      renderCard();

    } catch (e) {
      if (PE.C && PE.C.DEBUG) {
        console.warn('[PE] Failed to recalculate tokens:', e);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Fetch Background Service Worker Stats & Limits
  // ---------------------------------------------------------------------------
  function fetchBackgroundStats() {
    try {
      if (chrome && chrome.runtime && chrome.runtime.sendMessage && PE.C && PE.C.MSG && PE.C.MSG.GET_USAGE_STATS) {
        chrome.runtime.sendMessage({ type: PE.C.MSG.GET_USAGE_STATS }, function (response) {
          if (chrome.runtime.lastError) return;
          if (response && response.ok) {
            state.backgroundStats = response.stats;
            state.backgroundLimits = response.limits;
            state.configuredModel = response.model || '';
            state.pricing = response.pricing || {};
            recalculatePageTokens();
          }
        });
      }
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // Helper: Detect Site Design System & Theme Mode (Gemini, Claude, ChatGPT)
  // ---------------------------------------------------------------------------
  function detectSiteTheme() {
    var host = (window.location && window.location.hostname) ? window.location.hostname.toLowerCase() : '';
    var site = 'default';
    if (/gemini\.google\.com/i.test(host)) {
      site = 'gemini';
    } else if (/claude\.ai/i.test(host)) {
      site = 'claude';
    } else if (/chatgpt\.com|chat\.openai\.com/i.test(host)) {
      site = 'chatgpt';
    }

    var isDark = true;
    try {
      var html = document.documentElement;
      var body = document.body;
      var htmlClass = ((html && html.className) || '') + ' ' + ((body && body.className) || '');
      var dataTheme = (html && html.getAttribute('data-theme')) || (body && body.getAttribute('data-theme')) || '';
      var colorScheme = (html && html.getAttribute('data-color-scheme')) || (html && html.style && html.style.colorScheme) || '';

      if (/light/i.test(dataTheme) || /light/i.test(colorScheme) || (htmlClass.indexOf('light') !== -1 && htmlClass.indexOf('dark') === -1)) {
        isDark = false;
      } else if (body) {
        var bg = window.getComputedStyle(body).backgroundColor;
        var rgb = bg ? bg.match(/\d+/g) : null;
        if (rgb && rgb.length >= 3) {
          var lum = 0.299 * parseInt(rgb[0], 10) + 0.587 * parseInt(rgb[1], 10) + 0.114 * parseInt(rgb[2], 10);
          if (lum > 140) {
            isDark = false;
          }
        }
      }
    } catch (e) {}

    return {
      site: site,
      isDark: isDark
    };
  }

  // ---------------------------------------------------------------------------
  // Render Unified Floating Card
  // ---------------------------------------------------------------------------
  function renderCard() {
    if (!cardElement) return;

    // Detect & apply site design system theme (Gemini, Claude, ChatGPT, Light/Dark)
    var theme = detectSiteTheme();
    cardElement.classList.remove('theme-gemini', 'theme-claude', 'theme-chatgpt', 'theme-default', 'mode-dark', 'mode-light');
    cardElement.classList.add('theme-' + theme.site);
    cardElement.classList.add(theme.isDark ? 'mode-dark' : 'mode-light');

    // Remaining Reset Timer
    var now = Date.now();
    var elapsedMs = now - state.sessionStart;
    var remainingMs = Math.max(0, state.sessionDurationMs - elapsedMs);

    var remHours = Math.floor(remainingMs / (1000 * 60 * 60));
    var remMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    var resetStr = remHours + 'h ' + remMins + 'm';

    // Limits & Percentages
    var usedCount = 0;
    var limitMax = 0;
    var percentage = 16;
    var modeLabel = 'Session';

    var bStats = state.backgroundStats;
    var bLimits = state.backgroundLimits;

    if (state.activeLimitMode === 'session') {
      modeLabel = 'Session';
      var turns = state.conversationTurns || 1;
      usedCount = (bStats && bStats.counts && bStats.counts.today) ? bStats.counts.today : turns;
      limitMax = (bLimits && bLimits.daily && bLimits.daily.limit > 0) ? bLimits.daily.limit : 45;
      percentage = Math.min(100, Math.round((usedCount / limitMax) * 100));
      if (percentage <= 0) percentage = 16;
    } else if (state.activeLimitMode === 'weekly') {
      modeLabel = 'Weekly';
      usedCount = (bStats && bStats.counts && bStats.counts.week) ? bStats.counts.week : 0;
      limitMax = (bLimits && bLimits.weekly && bLimits.weekly.limit > 0) ? bLimits.weekly.limit : 200;
      percentage = Math.min(100, Math.round((usedCount / limitMax) * 100));
    } else if (state.activeLimitMode === 'daily') {
      modeLabel = 'Daily';
      usedCount = (bStats && bStats.counts && bStats.counts.today) ? bStats.counts.today : 0;
      limitMax = (bLimits && bLimits.daily && bLimits.daily.limit > 0) ? bLimits.daily.limit : 50;
      percentage = Math.min(100, Math.round((usedCount / limitMax) * 100));
    }

    var messagesLeft = Math.max(0, limitMax - usedCount);
    var isWarning = percentage >= 80;

    var tokensFormatted = formatTokens(state.conversationTokens);
    var costFormatted = formatCost(state.costUSD);

    // Collapsed Mini Pill HTML
    var miniHtml = [
      '<span class="pe-status-dot"></span>',
      '<span class="pe-mini-text"><strong class="pe-mini-val">' + tokensFormatted + '</strong> tok</span>',
      '<span class="pe-dot-sep">•</span>',
      '<span class="pe-mini-text"><strong class="pe-mini-val">' + percentage + '%</strong> ' + modeLabel.toLowerCase() + '</span>',
      '<span class="pe-dot-sep">•</span>',
      '<span class="pe-mini-text">' + resetStr + '</span>',
      '<div class="pe-mini-actions">',
      '  <button class="pe-btn-icon" id="pe-btn-mini-swap" title="Switch side (Left / Right)">' + ICONS.SWAP + '</button>',
      '  <button class="pe-btn-icon" id="pe-btn-expand" title="Expand">' + ICONS.CHEVRON_DOWN + '</button>',
      '</div>'
    ].join('');

    // Expanded Card HTML
    var fullHtml = [
      // Top Row: Model & Tokens & Controls
      '<div class="pe-card-header">',
      '  <div class="pe-header-left">',
      '    <div class="pe-model-badge" title="Active Model: ' + state.modelName + '">',
      '      <span class="pe-status-dot"></span>',
      '      <span>' + state.modelName + '</span>',
      '    </div>',
      '    <div class="pe-token-summary">',
      '      <span class="pe-token-count">' + tokensFormatted + '</span>',
      '      <span class="pe-token-unit">tok</span>',
      '      <span class="pe-dot-sep">•</span>',
      '      <span class="pe-cost-val">' + costFormatted + '</span>',
      '    </div>',
      '  </div>',
      '  <div class="pe-header-actions">',
      '    <button class="pe-btn-icon" id="pe-btn-swap" title="Switch side (Left / Right)">' + ICONS.SWAP + '</button>',
      '    <button class="pe-btn-icon" id="pe-btn-refresh" title="Recalculate">' + ICONS.REFRESH + '</button>',
      '    <button class="pe-btn-icon" id="pe-btn-collapse" title="Collapse">' + ICONS.CHEVRON_UP + '</button>',
      '    <button class="pe-btn-icon" id="pe-btn-close" title="Hide">' + ICONS.CLOSE + '</button>',
      '  </div>',
      '</div>',

      // Middle Row: Limit Selector & Metric Meta
      '<div class="pe-card-body">',
      '  <div class="pe-limit-row">',
      '    <div class="pe-limit-pills">',
      '      <button class="pe-pill-tab ' + (state.activeLimitMode === 'session' ? 'pe-active' : '') + '" data-mode="session">Session</button>',
      '      <button class="pe-pill-tab ' + (state.activeLimitMode === 'weekly' ? 'pe-active' : '') + '" data-mode="weekly">Weekly</button>',
      '      <button class="pe-pill-tab ' + (state.activeLimitMode === 'daily' ? 'pe-active' : '') + '" data-mode="daily">Daily</button>',
      '    </div>',
      '    <div class="pe-metric-meta">',
      '      <span class="pe-meta-pct">' + percentage + '% used</span>',
      '      <span class="pe-dot-sep">•</span>',
      '      <span class="pe-meta-reset">' + resetStr + '</span>',
      '      <span class="pe-dot-sep">•</span>',
      '      <span class="pe-meta-left">' + messagesLeft + ' left</span>',
      '    </div>',
      '  </div>',

      // Bottom Row: Slender Progress Bar
      '  <div class="pe-meter-container">',
      '    <div class="pe-meter-track">',
      '      <div class="pe-meter-bar ' + (isWarning ? 'pe-warn' : '') + '" style="width: ' + percentage + '%;"></div>',
      '      <div class="pe-meter-marker" style="left: 80%;"></div>',
      '    </div>',
      '  </div>',
      '</div>',

      // Collapsed Pill View
      '<div class="pe-card-collapsed-view">' + miniHtml + '</div>'
    ].join('');

    cardElement.innerHTML = fullHtml;

    // Attach Event Listeners
    var tabs = cardElement.querySelectorAll('.pe-pill-tab');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function (e) {
        var mode = e.currentTarget.getAttribute('data-mode');
        if (mode) {
          state.activeLimitMode = mode;
          try {
            if (window.localStorage) {
              window.localStorage.setItem('pe_stats_mode', mode);
            }
          } catch (err) {}
          renderCard();
        }
      });
    }

    // Swap Side Button (Left / Right)
    function handleSwap() {
      state.position = (state.position === 'right') ? 'left' : 'right';
      try {
        if (window.localStorage) {
          window.localStorage.setItem('pe_stats_position', state.position);
        }
      } catch (err) {}
      cardElement.classList.remove('pe-pos-right', 'pe-pos-left');
      cardElement.classList.add('pe-pos-' + state.position);
    }

    var btnSwap = cardElement.querySelector('#pe-btn-swap');
    if (btnSwap) btnSwap.addEventListener('click', handleSwap);

    var btnMiniSwap = cardElement.querySelector('#pe-btn-mini-swap');
    if (btnMiniSwap) btnMiniSwap.addEventListener('click', handleSwap);

    // Refresh
    var btnRefresh = cardElement.querySelector('#pe-btn-refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', function () {
        fetchBackgroundStats();
        recalculatePageTokens();
      });
    }

    // Collapse
    var btnCollapse = cardElement.querySelector('#pe-btn-collapse');
    if (btnCollapse) {
      btnCollapse.addEventListener('click', function () {
        state.collapsed = true;
        try {
          if (window.localStorage) {
            window.localStorage.setItem('pe_stats_collapsed', 'true');
          }
        } catch (err) {}
        cardElement.classList.add('pe-collapsed');
      });
    }

    // Expand
    var btnExpand = cardElement.querySelector('#pe-btn-expand');
    if (btnExpand) {
      btnExpand.addEventListener('click', function () {
        state.collapsed = false;
        try {
          if (window.localStorage) {
            window.localStorage.setItem('pe_stats_collapsed', 'false');
          }
        } catch (err) {}
        cardElement.classList.remove('pe-collapsed');
      });
    }

    // Close
    var btnClose = cardElement.querySelector('#pe-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', function () {
        cardElement.classList.add('pe-hidden');
      });
    }

    // Model Badge: click to change or override active model
    var modelBadge = cardElement.querySelector('.pe-model-badge');
    if (modelBadge) {
      modelBadge.style.cursor = 'pointer';
      modelBadge.setAttribute('title', 'Active Model: ' + state.modelName + ' (Click to change/override)');
      modelBadge.addEventListener('click', function () {
        var current = state.manualModel || state.modelName || 'Argon (High)';
        var input = window.prompt('Model name to display (or leave blank for auto-detect):', current);
        if (input !== null) {
          var trimmed = input.trim();
          state.manualModel = trimmed || null;
          try {
            if (window.localStorage) {
              if (trimmed) {
                window.localStorage.setItem('pe_custom_model', trimmed);
              } else {
                window.localStorage.removeItem('pe_custom_model');
              }
            }
          } catch (e) {}
          recalculatePageTokens();
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Initialize Overlay & Mount Shadow DOM
  // ---------------------------------------------------------------------------
  function initStatsOverlay() {
    if (document.getElementById('pe-stats-overlay-root')) {
      return;
    }

    hostElement = document.createElement('div');
    hostElement.id = 'pe-stats-overlay-root';
    shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // Stylesheet
    var styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    shadowRoot.appendChild(styleEl);

    // Unified Floating Card
    cardElement = document.createElement('div');
    cardElement.className = 'pe-stats-card pe-pos-' + state.position + (state.collapsed ? ' pe-collapsed' : '');
    shadowRoot.appendChild(cardElement);

    document.body.appendChild(hostElement);

    // Initial Population
    fetchBackgroundStats();
    recalculatePageTokens();

    // Setup MutationObserver with debouncing
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(function () {
        if (debounceTimeout) clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(function () {
          recalculatePageTokens();
        }, 500);
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    // Periodic Updates
    timerInterval = setInterval(function () {
      renderCard();
    }, 15000);

    pollInterval = setInterval(function () {
      fetchBackgroundStats();
    }, 30000);
  }

  // ---------------------------------------------------------------------------
  // Bootstrap on Document Ready
  // ---------------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStatsOverlay);
  } else {
    setTimeout(initStatsOverlay, 300);
  }

  // Export overlay controller for programmatic access
  PE.statsOverlay = {
    recalculate: recalculatePageTokens,
    refresh: fetchBackgroundStats,
    setPosition: function (pos) {
      if (pos === 'left' || pos === 'right') {
        state.position = pos;
        if (cardElement) {
          cardElement.classList.remove('pe-pos-right', 'pe-pos-left');
          cardElement.classList.add('pe-pos-' + pos);
        }
      }
    },
    setModel: function (modelName) {
      state.manualModel = modelName ? String(modelName).trim() : null;
      try {
        if (window.localStorage) {
          if (state.manualModel) {
            window.localStorage.setItem('pe_custom_model', state.manualModel);
          } else {
            window.localStorage.removeItem('pe_custom_model');
          }
        }
      } catch (e) {}
      recalculatePageTokens();
    },
    show: function () {
      if (cardElement) cardElement.classList.remove('pe-hidden');
    },
    hide: function () {
      if (cardElement) cardElement.classList.add('pe-hidden');
    }
  };

}());
