# Paper → Zotero

A browser extension for Arc (and any Chromium-based browser) that attaches an AI-generated summary note to any paper you save in Zotero — in one click.

## What it does

This extension works *alongside* the [Zotero Connector](https://www.zotero.org/download/connectors) — it doesn't replace it. The Connector handles saving papers to your library (with site-specific translators for hundreds of journals). This extension's sole job is to read the paper, generate a structured summary using Claude, and attach it as a note to the Zotero entry.

**Workflow:**
1. Navigate to any paper page (arXiv, APS, Nature, Springer, etc.)
2. Save to Zotero using the Zotero Connector as normal
3. Click this extension's toolbar button
4. Confirm the detected paper matches your most recently saved Zotero item
5. Click **Generate & Attach Summary**
6. Optionally open a formatted summary tab

## Prerequisites

You need three things installed/set up before using this extension.

### 1. Zotero + Zotero Connector

**Zotero** is a free, open-source reference manager. Download it at [zotero.org/download](https://www.zotero.org/download). You must have the desktop app running for the Connector to save papers.

**Zotero Connector** is the browser extension that saves papers to your Zotero library with a single click. Install it for Arc/Chrome at [zotero.org/download/connectors](https://www.zotero.org/download/connectors). Both are completely free.

### 2. Anthropic API access

This extension uses [Claude](https://www.anthropic.com/claude) (specifically the `claude-haiku` model) to generate summaries. This requires an Anthropic API key.

**To get an API key:**
1. Go to [platform.claude.com](https://platform.claude.com) and create an account
2. Once logged in, find **API Keys** in the left sidebar and create a new key
3. You'll need to add a small amount of credit to use the API — go to **Billing** and add funds (a few dollars goes a very long way at Haiku pricing)

**Cost:** Haiku is Anthropic's fastest and cheapest model. Summarising a paper costs a fraction of a cent — $5 of credit would cover thousands of summaries.

> Your API key is stored locally in your browser and is only ever sent to Anthropic's API. It is never stored on any external server.

### 3. Zotero API key

To attach notes to your Zotero library programmatically, you need a Zotero API key.

**To get one:**
1. Log in at [zotero.org](https://www.zotero.org) and go to [zotero.org/settings/keys](https://www.zotero.org/settings/keys)
2. Note your **User ID** — the number shown beneath your username on that page
3. Click **Create new private key**, give it a name (e.g. "Paper summary extension"), and enable **Allow library access** with read/write permissions
4. Copy the key — you won't be able to see it again after leaving the page

> Your Zotero credentials are stored locally in your browser and are only ever sent to the Zotero API.

## Installation

1. Download or clone this repository
2. Open `arc://extensions` (or `chrome://extensions`) and enable **Developer Mode** (toggle in the top right)
3. Click **Load unpacked** and select the repository folder
4. Click the ⚙️ icon in the extension popup and enter your three credentials (Anthropic API key, Zotero User ID, Zotero API key), then hit **Save**

## Usage

Navigate to any paper page and save it to Zotero with the Zotero Connector first. Then click the **Paper → Zotero** toolbar button. The popup will show the current page title and confirm it matches the most recently saved Zotero item. Click **Generate & Attach Summary** to proceed.

Works with arXiv (both abstract and PDF URLs), APS journals, Nature, Springer, and any journal that embeds standard `citation_*` metadata tags in its pages.

## Summary format

Each paper gets a Zotero note structured as:

- **What it does** — problem and approach in 1–2 sentences
- **Method** — key technical approach
- **Key results** — bullet list of main findings
- **Notable finding** — the most interesting result

## Privacy

All credentials (Anthropic API key, Zotero User ID, Zotero API key) are stored locally in your browser using `chrome.storage.sync`. They are only ever transmitted to their respective APIs (Anthropic and Zotero) and are never sent to any other server.
