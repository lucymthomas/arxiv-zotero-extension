// Credentials loaded from storage at runtime — not hardcoded

// ── UI helpers ────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function showPanel(id) {
  ["state-settings", "state-not-arxiv", "state-ready", "state-success"].forEach(s => {
    $(s).classList.toggle("hidden", s !== id);
  });
}

function setStep(id, status, icon) {
  const el = $(id);
  el.className = "step " + status;
  el.querySelector(".step-icon").textContent = icon;
}

// ── Settings panel ────────────────────────────────────────────────────────────

let settingsOpen = false;
let mainPanel = "state-not-arxiv"; // will be updated by init()

$("settings-toggle").addEventListener("click", () => {
  settingsOpen = !settingsOpen;
  if (settingsOpen) {
    showPanel("state-settings");
  } else {
    showPanel(mainPanel);
  }
});

$("toggle-show").addEventListener("click", () => {
  const input = $("api-key-input");
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  $("toggle-show").textContent = isPassword ? "Hide" : "Show";
});

$("toggle-show-zotero").addEventListener("click", () => {
  const input = $("zotero-api-key-input");
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  $("toggle-show-zotero").textContent = isPassword ? "Hide" : "Show";
});

$("save-btn").addEventListener("click", () => {
  const data = {
    claudeApiKey: $("api-key-input").value.trim(),
    zoteroUserId: $("zotero-user-id-input").value.trim(),
    zoteroApiKey: $("zotero-api-key-input").value.trim(),
  };
  chrome.storage.sync.set(data, () => {
    const msg = $("saved-msg");
    msg.classList.remove("hidden");
    setTimeout(() => {
      msg.classList.add("hidden");
      settingsOpen = false;
      init();
    }, 1000);
  });
});

// Load saved credentials into settings inputs
chrome.storage.sync.get(["claudeApiKey", "zoteroUserId", "zoteroApiKey"], (s) => {
  if (s.claudeApiKey)  $("api-key-input").value = s.claudeApiKey;
  if (s.zoteroUserId)  $("zotero-user-id-input").value = s.zoteroUserId;
  if (s.zoteroApiKey)  $("zotero-api-key-input").value = s.zoteroApiKey;
});


// ── arXiv helpers ─────────────────────────────────────────────────────────────

function extractArxivId(url) {
  const m = url.match(/arxiv\.org\/(?:abs|pdf|html)\/([^\/?#]+(?:\/\d+)?)/i);
  return m ? m[1].replace(/v\d+$/, "") : null;
}

async function fetchMetadata(arxivId) {
  const res = await fetch(`https://ar5iv.labs.arxiv.org/html/${arxivId}`);
  if (!res.ok) throw new Error(`ar5iv fetch failed: ${res.status}`);
  const html = await res.text();

  function getMeta(name) {
    const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))
              || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"));
    return m ? m[1] : null;
  }

  let title = getMeta("citation_title") || getMeta("og:title");
  if (!title) {
    const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    title = t ? t[1].replace(/^\[.*?\]\s*/, "").trim() : "Unknown Title";
  }

  const abstract = getMeta("citation_abstract") || getMeta("og:description") || "";

  const authorMatches = [...html.matchAll(/<meta[^>]+name=["']citation_author["'][^>]+content=["']([^"']+)["']/gi)];
  const authors = authorMatches.map(m => {
    const parts = m[1].split(",").map(s => s.trim());
    return parts.length === 2
      ? { creatorType: "author", firstName: parts[1], lastName: parts[0] }
      : { creatorType: "author", firstName: "", lastName: m[1] };
  });

  let date = getMeta("citation_date") || getMeta("citation_online_date") || "";
  date = date.replace(/\//g, "-");

  return { title, abstract, authors, date, arxivId };
}

// ── Claude summary ────────────────────────────────────────────────────────────

async function generateSummary(meta, apiKey) {
  const today = new Date().toLocaleDateString("en-US");
  const prompt = `You are a research assistant. Given the title and abstract of an arXiv paper, write a concise HTML summary note for a Zotero library entry.

Structure it exactly like this:
<p><strong>What it does:</strong> [1–2 sentences: problem + approach]</p>
<p><strong>Method:</strong> [key technical approach]</p>
<p><strong>Key results:</strong></p>
<ul>
  <li>[result 1]</li>
  <li>[result 2]</li>
  <li>[result 3]</li>
</ul>
<p><strong>Notable finding:</strong> [the most interesting or surprising result]</p>
<p><em>Added automatically via Claude · ${today}</em></p>

Paper title: ${meta.title}
Abstract: ${meta.abstract}

Return only the HTML, nothing else.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API error ${res.status}: ${err?.error?.message || "unknown"}`);
  }
  const data = await res.json();
  return data.content[0].text.trim();
}

// ── Zotero ────────────────────────────────────────────────────────────────────

async function addToZotero(meta, summaryHtml, zoteroUserId, zoteroApiKey) {
  const ZOTERO_BASE = `https://api.zotero.org/users/${zoteroUserId}`;
  const paper = {
    itemType: "preprint",
    title: meta.title,
    creators: meta.authors.length ? meta.authors : [{ creatorType: "author", firstName: "", lastName: "Unknown" }],
    date: meta.date,
    url: `https://arxiv.org/abs/${meta.arxivId}`,
    DOI: `10.48550/arXiv.${meta.arxivId}`,
    repository: "arXiv",
    archiveID: `arXiv:${meta.arxivId}`,
    abstractNote: meta.abstract
  };

  const itemRes = await fetch(`${ZOTERO_BASE}/items`, {
    method: "POST",
    headers: { "Zotero-API-Key": zoteroApiKey, "Content-Type": "application/json" },
    body: JSON.stringify([paper])
  });
  if (!itemRes.ok) throw new Error(`Zotero item POST failed: ${itemRes.status}`);
  const itemData = await itemRes.json();

  const keys = Object.keys(itemData.successful || {});
  if (!keys.length) throw new Error("Paper may already exist in your Zotero library.");
  const itemKey = itemData.successful[keys[0]].key;

  const noteRes = await fetch(`${ZOTERO_BASE}/items`, {
    method: "POST",
    headers: { "Zotero-API-Key": zoteroApiKey, "Content-Type": "application/json" },
    body: JSON.stringify([{ itemType: "note", parentItem: itemKey, note: summaryHtml }])
  });
  if (!noteRes.ok) throw new Error(`Zotero note POST failed: ${noteRes.status}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function init() {
  const { claudeApiKey, zoteroUserId, zoteroApiKey } = await chrome.storage.sync.get(["claudeApiKey", "zoteroUserId", "zoteroApiKey"]);

  if (!claudeApiKey || !zoteroUserId || !zoteroApiKey) {
    mainPanel = "state-settings";
    showPanel("state-settings");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const arxivId = tab?.url ? extractArxivId(tab.url) : null;

  if (!arxivId) {
    mainPanel = "state-not-arxiv";
    showPanel("state-not-arxiv");
    return;
  }

  mainPanel = "state-ready";
  showPanel("state-ready");
  $("paper-title").textContent = "Loading…";
  $("paper-meta").textContent = `arXiv:${arxivId}`;

  const addBtn = $("add-btn");
  let meta;

  try {
    setStep("step-fetch", "active", "⏳");
    meta = await fetchMetadata(arxivId);
    setStep("step-fetch", "done", "✓");
    $("paper-title").textContent = meta.title;
    const authorStr = meta.authors.slice(0, 3).map(a => `${a.firstName} ${a.lastName}`.trim()).join(", ")
      + (meta.authors.length > 3 ? " et al." : "");
    $("paper-meta").textContent = [authorStr, meta.date].filter(Boolean).join(" · ");
  } catch (e) {
    setStep("step-fetch", "error", "✗");
    $("paper-title").textContent = "Could not load metadata";
    $("paper-meta").textContent = e.message;
    addBtn.disabled = true;
    return;
  }

  // Remove any old listener by cloning the button
  const newBtn = addBtn.cloneNode(true);
  addBtn.parentNode.replaceChild(newBtn, addBtn);

  newBtn.addEventListener("click", async () => {
    newBtn.disabled = true;
    try {
      setStep("step-summarise", "active", "⏳");
      const summary = await generateSummary(meta, claudeApiKey);
      setStep("step-summarise", "done", "✓");

      // Write summary to storage as soon as it's ready so the tab can load immediately
      await chrome.storage.local.set({
        lastSummary: { title: meta.title, authors: meta.authors, date: meta.date, arxivId: meta.arxivId, summaryHtml: summary }
      });

      setStep("step-zotero", "active", "⏳");
      await addToZotero(meta, summary, zoteroUserId, zoteroApiKey);
      setStep("step-zotero", "done", "✓");

      setTimeout(() => {
        mainPanel = "state-success";
        showPanel("state-success");
        $("view-summary-btn").addEventListener("click", () => {
          chrome.tabs.create({ url: chrome.runtime.getURL("summary.html") });
        });
      }, 400);
    } catch (e) {
      ["step-fetch", "step-summarise", "step-zotero"].forEach(id => {
        if ($(id).classList.contains("active")) setStep(id, "error", "✗");
      });
      const p = document.createElement("p");
      p.style.cssText = "margin-top:12px;font-size:0.8rem;color:#dc2626;";
      p.textContent = e.message;
      $("progress").appendChild(p);
      newBtn.disabled = false;
    }
  });
}

init();
