# arXiv → Zotero

A browser extension for Arc (and any Chromium-based browser) that adds arXiv papers to your Zotero library with an AI-generated summary note — in one click.

## What it does

1. You navigate to any arXiv paper page
2. Click the toolbar button
3. The extension fetches the paper metadata, generates a structured summary using Claude, and adds the paper + note to your Zotero library
4. Optionally opens a formatted summary tab

## Setup

### 1. Install the extension

- Download or clone this repo
- Open `arc://extensions` (or `chrome://extensions`) and enable **Developer Mode**
- Click **Load unpacked** and select the repo folder

### 2. Get your credentials

You'll need three things — all entered in the extension's settings panel (click ⚙️):

**Anthropic API key**
- Go to [platform.claude.com](https://platform.claude.com), log in, and find API Keys in the sidebar
- The extension uses `claude-haiku` — very cheap (fractions of a cent per paper)

**Zotero User ID + API Key**
- Go to [zotero.org/settings/keys](https://www.zotero.org/settings/keys)
- Your User ID is the number shown under your username
- Create a new API key with read/write access to your library

### 3. Enter credentials

Click the ⚙️ icon in the extension popup, fill in all three fields, and hit Save.

## Usage

Navigate to any arXiv paper (e.g. `https://arxiv.org/abs/2301.07041`) and click the extension icon. The popup shows the paper title and a progress indicator as it works through fetching, summarising, and adding to Zotero.

## Summary format

Each paper gets a Zotero note structured as:

- **What it does** — problem and approach in 1–2 sentences
- **Method** — key technical approach
- **Key results** — bullet list of main findings
- **Notable finding** — the most interesting result

## Notes

- All credentials are stored locally in your browser via `chrome.storage.sync` and never sent anywhere except the respective APIs (Anthropic and Zotero)
- Works with both new-style arXiv IDs (`2301.07041`) and old-style (`gr-qc/0003032`)
