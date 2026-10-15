# Prompt Enhancer — Chrome Extension

> **Turn rough drafts into structured, high-quality prompts on ChatGPT, Claude, and Gemini using your own API key.**

Prompt Enhancer is a lightweight, privacy-focused Manifest V3 Chrome Extension that transforms unfinished or conversational drafts into expert-level structured prompts. It automatically formats prompts with an explicit persona/role, context, clear objective, numbered requirements, constraints, and output format specification.

---

## Key Features

- **Multi-Platform Support:** Native out-of-the-box DOM adapters for:
  - **ChatGPT** (`chatgpt.com`, `chat.openai.com`) — ProseMirror & Quill contenteditable editors.
  - **Claude** (`claude.ai`) — ProseMirror rich-text editors.
  - **Gemini** (`gemini.google.com`) — Quill rich-textarea editors.
  - **Generic Sites** — Any website with a standard `<textarea>` or text `<input>` (e.g. GitHub, Reddit, forums).
  - **Manual Mode** — Built-in popup fallback tool for unsupported or restricted internal pages (`chrome://`).
- **Flexible AI Providers:**
  - **OpenRouter** (Default & recommended; supports hundreds of models including free tiers like `apodex/apodex-1.1-mini:free`).
  - **OpenCode Zen** (`opencode.ai/zen`).
  - **Custom OpenAI-Compatible Endpoints** — Local models hosted on **Ollama** (`http://localhost:11434/v1`), **LM Studio** (`http://localhost:1234/v1`), or private servers.
- **Context-Aware Enhancement:** Automatically extracts recent conversation history from the active chat in **ChatGPT**, **Claude**, and **Gemini**, passing it as context in the enhancement request. Ambiguous drafts like *"now fix this bug"* or *"write tests for that function"* are rewritten with complete situational context and technical accuracy.
- **Three Enhancement Styles:**
  - **Balanced** (Default): Complete structure with persona, context, numbered requirements, constraints, and output format.
  - **Concise**: High-impact bulleted requirements (≤ 120 words).
  - **Detailed**: Comprehensive prompt with rigorous success criteria and edge cases to consider.
- **Custom System Rules:** Append up to 4,000 characters of custom guidelines (e.g., *"Always request responses in tables"*, *"Use Python 3.12 syntax"*).
- **Three Frictionless Triggers:**
  - **Popup Primary Button:** Click ✨ toolbar icon → click **Enhance Prompt**.
  - **Global Keyboard Shortcut:** Press `Alt+Shift+E` inside any active chat input.
  - **Context Menu:** Right-click inside any editable box → select **Enhance Prompt**.
- **Interactive In-Page UI:**
  - Closed Shadow DOM isolation (zero styling interference with host websites).
  - Spinner with real-time **Cancel** button.
  - **Undo Button** (restores original draft in 1 click; native `Ctrl+Z` also preserved).
  - **Stale Editor Guard:** Detects if you continued typing while waiting and gives you **"Insert anyway"** or **"Copy"** options so your changes are never lost.
  - Automatic clipboard copy fallback if a site changes its internal DOM.

---

## Installation Guide

### Google Chrome / Brave / Edge ("Load Unpacked")

1. Open Google Chrome and enter `chrome://extensions` in the address bar.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left toolbar.
4. Select the `extension/` folder in this repository.
5. Prompt Enhancer is now installed! Pin **Prompt Enhancer** in your toolbar.

### Mozilla Firefox ("Load Temporary Add-on")

1. Open Mozilla Firefox and enter `about:debugging#/runtime/this-firefox` in the address bar.
2. Click **Load Temporary Add-on...**
3. Select `extension-firefox/manifest.json` in this repository.
4. Prompt Enhancer is now active in Firefox!
*(To re-sync any local code changes into the Firefox folder at any time, run: `npm run build:firefox`).*

---

## Configuration & API Key Setup

1. Click the **Prompt Enhancer** icon (✨) in your Chrome toolbar.
2. On fresh install, the extension opens directly to the **Settings** tab.
3. Choose your preferred **Provider**:
   - **OpenRouter:**
     - Click **"Get an API key for OpenRouter ↗"** to generate an API key at [openrouter.ai/keys](https://openrouter.ai/keys).
     - Paste your key (`sk-or-v1-...`).
     - Click **Load Models** to populate the model dropdown, or enter your model ID (e.g. `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`, `apodex/apodex-1.1-mini:free`).
   - **OpenCode:**
     - Paste your OpenCode Zen API key and model name.
   - **Custom / Local (Ollama, LM Studio):**
     - Enter your Base URL (e.g. `http://localhost:11434/v1`).
     - Enter your model tag (e.g. `llama3.2`, `mistral`).
     - For local servers without authentication, leave the API key blank.
4. Click **Test Connection**:
   - Stage 1 validates your API key.
   - Stage 2 sends a lightweight ping to verify that the chosen model responds.
   - When verified, a green checkmark with round-trip latency will appear.
5. Click **Save Settings**.

---

## How to Use

### 1. In-Page Enhancement (Popup)
- Go to ChatGPT, Claude, or Gemini.
- Type a rough draft prompt into the chat box (e.g., *"write python script to scrap headlines"*).
- Click the extension icon. The popup will display the detected site and draft character count.
- Click **Enhance Prompt**. The popup closes and the in-page overlay smoothly rewrites your draft!

### 2. Global Keyboard Shortcut (`Alt+Shift+E`)
- Click into any text input or chat box.
- Press **`Alt+Shift+E`** (or `Option+Shift+E` on macOS).
- The extension immediately starts enhancing your text in-place.
- *To customize the shortcut:* Visit `chrome://extensions/shortcuts` and rebind **"Enhance the prompt in the focused chat box"** to any combination.

### 3. Context Menu Entry Point
- Right-click anywhere inside an editable chat box or textarea.
- Select **Enhance Prompt**.

### 4. Manual Mode (Universal Fallback)
- If you are on an internal browser page (`chrome://`, webstore) or an unsupported site:
- Open the extension popup.
- Expand **Manual Mode**.
- Paste your draft prompt into the text area and click **✨ Enhance**.
- Once generated, click **📋 Copy** to copy the enhanced prompt to your clipboard.

### 5. Stale Editor Guard & Clipboard Fallback
- **Text modified while waiting:** If you edit the prompt while the AI model is thinking, Prompt Enhancer will not overwrite your work. It presents an on-page warning with **"Insert anyway"** and **"Copy"** buttons.
- **Copy last result:** If you close the tab or an in-page write fails, open the extension popup and click **"📋 Copy last result"** to retrieve your prompt.

---

## Privacy & Security

Prompt Enhancer is engineered with strict client-side security principles:
- **Local Storage Only:** API keys and preferences are stored exclusively in `chrome.storage.local` within your browser profile. They are **never** synced via Chrome Sync.
- **Zero Third-Party Relays:** API requests are dispatched directly from your browser to your chosen provider endpoint (OpenRouter, OpenCode, or your custom server).
- **No Analytics / No Tracking:** The extension includes zero analytics libraries, zero tracking scripts, and zero telemetry.
- **Safe DOM Injection:** All text replacements use DOM value setters, `execCommand`, or `textContent`—never `innerHTML`—preventing cross-site scripting (XSS).
- **Strict Content Security Policy (CSP):** Manifest V3 compliant with zero inline scripts or `eval()`.

---

## Troubleshooting Guide

| Symptom | Cause | Solution |
|---|---|---|
| Enhance button disabled with *"Configure your API key in Settings first"* | No API key saved for active provider | Open popup → Settings → enter your key and click Save. |
| Enhance button disabled with *"Click into the chat box first"* | No active input detected | Click inside the chat box on ChatGPT/Claude/Gemini before opening popup. |
| Toast says *"The text changed while enhancing"* | You typed into the editor while waiting | Click **"Insert anyway"** to overwrite, or **"Copy"** to copy the enhanced version to clipboard. |
| In-page error toast: *"API key is invalid or unauthorized"* | Key expired, revoked, or mistyped | Go to Settings, re-enter your key, and click **Test Connection**. |
| In-page error toast: *"Network request timed out"* | Model took longer than 60s or network disconnected | Check connection or try a faster model (e.g. `openai/gpt-4o-mini`). |
| Popup says *"Can't run on this page"* | Chrome security policy prohibits scripting on `chrome://` and webstore pages | Use **Manual Mode** in the popup to enhance and copy your prompt. |
| Keyboard shortcut does not trigger | Shortcut conflict with browser or site shortcut | Open `chrome://extensions/shortcuts` and assign a new combination (e.g. `Ctrl+Shift+P`). |
| "Prompt Enhancer was updated — please reload this page" | Extension was reloaded while tab was open | Refresh the webpage (`F5` or `Ctrl+R`) to re-inject the content script. |

---

## License

MIT License. Free and open source for personal and commercial use.
