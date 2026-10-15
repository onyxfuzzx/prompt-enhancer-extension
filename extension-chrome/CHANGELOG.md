# Prompt Enhancer — Changelog

Entries follow the format:
Phase N — complete — YYYY-MM-DD — one-line summary

---

Phase 1 — complete — 2026-10-11 — Foundation: manifest.json (MV3), placeholder icons (16/32/48/128 px), PE namespace + full constants, stub service worker with importScripts + onInstalled + NOT_IMPLEMENTED router, full static popup HTML with all required IDs, complete popup CSS (light/dark, tabs, forms, badges, collapsibles, spinner), popup.js tab-switching + collapsibles + version display, README.md, CHANGELOG.md.

---

Phase 2 — complete — 2026-10-11 — Storage, Settings & API Key Verification: PE.errors with redaction/normalization, PE.storage for chrome.storage.local with deep-merge defaults and runtime state, PE.http wrapper with AbortController timeouts and status mapping, provider adapters for OpenRouter (verified /key and /models endpoints), OpenCode Zen (verified /zen/v1 /models and /chat/completions), and Custom OpenAI-compatible endpoints with runtime origin permissions, service-worker.js message router (TEST_CONNECTION two-stage key+model check, LIST_MODELS, GET_LAST_RESULT), popup.html updated script load order, full popup.js Settings tab logic with provider drafts, show/hide key, live char counter/temperature badge, model datalist loading, dirty tracking, and manifest bumped to 0.2.0.

---

Phase 3 — complete — 2026-10-12 — DOM Extraction & Text Replacement: PE.C content-constants mirroring MSG/LIMITS, PE.sites registry with verified selector rules for ChatGPT (#prompt-textarea[contenteditable="true"], div.ProseMirror[contenteditable="true"]), Claude (div.ProseMirror[contenteditable="true"], [role="textbox"]), Gemini (rich-textarea .ql-editor[contenteditable="true"]), and Generic textareas, PE.dom target detection (focusin capture tracking, activeElement, querySelector), text extraction & normalization, write strategy chain (execCommand insertText, synthetic paste, native value setter, direct DOM, clipboard fallback), PE.ui in closed Shadow DOM (#pe-overlay-host) with spinner, cancel, success toast with undo, and error dialogs, content.js orchestration with double-injection guard and 1.2s mock delay flow, manifest.json content_scripts array added and version bumped to 0.3.0, popup.js wired with active tab pinging, dynamic site/draft detection, and START_ENHANCE trigger.

---

Phase 4 — complete — 2026-10-12 — Background Service Worker & Dynamic API Integration: Created PE.enhancer (system prompt builder with Balanced/Concise/Detailed style variants, prompt injection hardening with <draft> boundary tags, custom rules appending, and cleanOutput stripping reasoning <think> blocks, markdown code blocks, conversational preambles, and echo tags), updated service-worker.js to route ENHANCE_PROMPT (storage settings resolution, input length validation, custom endpoint origin permission checks, 60s timeout, 1-shot retry on 5xx/network errors, and lastResult persistence) and manage action badges per tab for ENHANCE_STATUS (…/#6b7280 busy, ✓/#10b981 success, !/#ef4444 error), updated content.js with real ENHANCE_PROMPT message passing (completely eliminated Phase 3 mock, added in-flight cancellation discard, stale editor guard, and error toast handling), enhanced popup.js to disable Enhance button when active API key or model is not configured and wired popup Manual Mode fallback enhancement and copy, manifest.json version bumped to 0.4.0.

---

Phase 5 — complete — 2026-10-12 — End-to-End Integration, Edge Cases & Final Polish: Added global keyboard shortcut trigger (Alt+Shift+E via chrome.commands.onCommand), context menu entry point ("Enhance Prompt" on editable contexts via chrome.contextMenus.create and onClicked listener), implemented shared triggerEnhanceInTab in service-worker.js with automatic injection and retry on un-injected tabs, added Stale Editor Guard (E7) in content.js and ui-overlay.js with on-page warning toast and "Insert anyway" / "Copy" buttons, wired popup "Copy last result" button and deep link to chrome://extensions/shortcuts, implemented comprehensive edge case handling (E1–E17) including network offline retry, clipboard fallback toasts, extension context invalidation toasts, and character limit pre-checks, created docs/TESTING.md with full manual verification matrix, updated README.md user guide, bumped manifest version to 1.0.0, and verified 100% pass across all 25 automated tests.
