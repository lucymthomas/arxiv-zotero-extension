// ── UI helpers ────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function showPanel(id) {
  ["state-settings", "state-idle", "state-ready", "state-success"].forEach(s => {
    $(s).classList.toggle("hidden", s !== id);
  });
}

function setStep(id, status, icon) {
  const el = $(id);
  el.className = "step " + status;
  el.querySelector(".step-icon").textContent = icon;
}

// ── Settings ──────────────────────────────────────────────────────────────────

let settingsOpen = false;
let mainPanel = "state-idle";

$("settings-toggle").addEventListener("click", () => {
  settingsOpen = !settingsOpen;
  showPanel(settingsOpen ? "state-settings" : mainPanel);
});

$("toggle-show").addEventListener("click", () => {
  const el = $("api-key-input");
  el.type = el.type === "password" ? "text" : "password";
  $("toggle-show").textContent = el.type === "password" ? "Show" : "Hide";
});

$("toggle-show-zotero").addEventListener("click", () => {
  const el = $("zotero-api-key-input");
  el.type = el.type === "password" ? "text" : "password";
  $("toggle-show-zotero").textContent = el.type === "password" ? "Show" : "Hide";
});

$("save-btn").addEventListener("click", () => {
  chrome.storage.sync.set({
    claudeApiKey:  $("api-key-input").value.trim(),
    zoteroUserId:  $("zotero-user-id-input").value.trim(),
    zoteroApiKey:  $("zotero-api-key-input").value.trim(),
  }, () => {
    const msg = $("saved-msg");
    msg.classList.remove("hidden");
    setTimeout(() => { msg.classList.add("hidden"); settingsOpen = false; init(); }, 1000);
  });
});

chrome.storage.sync.get(["claudeApiKey", "zoteroUserId", "zoteroApiKey"], s => {
  if (s.claudeApiKey) $("api-key-input").value = s.claudeApiKey;
  if (s.zoteroUserId) $("zotero-user-id-input").value = s.zoteroUserId;
  if (s.zoteroApiKey) $("zotero-api-key-input").value = s.zoteroApiKey;
});

// ── arXiv PDF fallback (content scripts can't run on PDF pages) ───────────────

function extractArxivId(url) {
  const m = url.match(/arxiv\.org\/(?:abs|pdf|html)\/([^\/?#]+(?:\/\d+)?)/i);
  return m ? m[1].replace(/v\d+$/, "") : null;
}

async function fetchArxivMeta(arxivId) {
  const res = await fetch(`https://ar5iv.labs.arxiv.org/html/${arxivId}`);
  if (!res.ok) throw new Error(`ar5iv fetch failed: ${res.status}`);
  const html = await res.text();

  function getMeta(name) {
    const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))
              || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"));
    return m ? m[1] : null;
  }

  const title = getMeta("citation_title") || getMeta("og:title") || "";
  const abstract = getMeta("citation_abstract") || getMeta("og:description") || "";
  const authorMatches = [...html.matchAll(/<meta[^>]+name=["']citation_author["'][^>]+content=["']([^"']+)["']/gi)];
  const authors = authorMatches.map(m => {
    const parts = m[1].split(",").map(s => s.trim());
    return parts.length === 2
      ? { creatorType: "author", firstName: parts[1], lastName: parts[0] }
      : { creatorType: "author", firstName: "", lastName: m[1] };
  });
  const date = (getMeta("citation_date") || "").replace(/\//g, "-");

  return { title, abstract, authors, date, arxivId, itemType: "preprint", bodyText: "", url: `https://arxiv.org/abs/${arxivId}`, doi: null, journal: "" };
}

// ── Page metadata via content script ─────────────────────────────────────────

async function getPageMeta(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "GET_PAPER_METADATA" }, response => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
          if (chrome.runtime.lastError) { reject(new Error("Cannot read this page.")); return; }
          chrome.tabs.sendMessage(tabId, { type: "GET_PAPER_METADATA" }, r => {
            if (!r?.success) reject(new Error(r?.error || "Failed."));
            else resolve(r.data);
          });
        });
      } else if (!response?.success) {
        reject(new Error(response?.error || "Failed."));
      } else {
        resolve(response.data);
      }
    });
  });
}

function isPaper(meta) {
  return meta.title && meta.title.length > 5 && (meta.doi || meta.arxivId || meta.authors.length > 0);
}

// ── Zotero: fetch most recent item ───────────────────────────────────────────

async function getLatestZoteroItem(userId, apiKey) {
  const res = await fetch(
    `https://api.zotero.org/users/${userId}/items/top?sort=dateAdded&direction=desc&limit=1`,
    { headers: { "Zotero-API-Key": apiKey } }
  );
  if (!res.ok) throw new Error(`Zotero API error: ${res.status}`);
  const items = await res.json();
  if (!items.length) throw new Error("No items found in your Zotero library.");
  return items[0]; // { key, data: { title, creators, date, ... } }
}

// ── Zotero: attach note ───────────────────────────────────────────────────────

async function attachNote(userId, apiKey, itemKey, noteHtml) {
  const res = await fetch(`https://api.zotero.org/users/${userId}/items`, {
    method: "POST",
    headers: { "Zotero-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify([{ itemType: "note", parentItem: itemKey, note: noteHtml }])
  });
  if (!res.ok) throw new Error(`Zotero note POST failed: ${res.status}`);
}

// ── Claude summary ────────────────────────────────────────────────────────────

async function generateSummary(meta, apiKey) {
  const today = new Date().toLocaleDateString("en-US");
  const hasBody = meta.bodyText && meta.bodyText.length > 500;
  const context = hasBody
    ? `Abstract: ${meta.abstract}\n\nFull text (excerpt):\n${meta.bodyText}`
    : `Abstract: ${meta.abstract || "(not available)"}`;

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
      messages: [{
        role: "user",
        content: `You are a research assistant. Write a concise HTML summary note for a Zotero library entry.

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
${context}

Return only the HTML, nothing else.`
      }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API error ${res.status}: ${err?.error?.message || "unknown"}`);
  }
  const data = await res.json();
  return data.content[0].text.trim().replace(/^```html\s*/i, "").replace(/\s*```$/, "");
}

// ── Loose title match (ignores case/punctuation) ──────────────────────────────

function titlesSimilar(a, b) {
  const words = s => new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3)
  );
  const wa = words(a), wb = words(b);
  if (wa.size === 0 || wb.size === 0) return false;
  const overlap = [...wa].filter(w => wb.has(w)).length;
  // Match if 60% of the smaller title's words appear in the other
  return overlap / Math.min(wa.size, wb.size) >= 0.6;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function init() {
  const { claudeApiKey, zoteroUserId, zoteroApiKey } =
    await chrome.storage.sync.get(["claudeApiKey", "zoteroUserId", "zoteroApiKey"]);

  if (!claudeApiKey || !zoteroUserId || !zoteroApiKey) {
    mainPanel = "state-settings";
    showPanel("state-settings");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Load page meta and latest Zotero item in parallel
  mainPanel = "state-ready";
  showPanel("state-ready");

  let pageMeta, zoteroItem;

  // For arxiv PDF URLs, content scripts can't run — fetch metadata directly instead
  const arxivId = tab?.url ? extractArxivId(tab.url) : null;
  const isPdfUrl = tab?.url?.match(/arxiv\.org\/pdf\//i);
  const pageMetaPromise = (arxivId && isPdfUrl)
    ? fetchArxivMeta(arxivId)
    : getPageMeta(tab?.id);

  const [pageResult, zoteroResult] = await Promise.allSettled([
    pageMetaPromise,
    getLatestZoteroItem(zoteroUserId, zoteroApiKey)
  ]);

  // ── Current page ──
  if (pageResult.status === "fulfilled" && isPaper(pageResult.value)) {
    pageMeta = pageResult.value;
    $("paper-title").textContent = pageMeta.title;
    const authorStr = pageMeta.authors.slice(0, 3)
      .map(a => `${a.firstName} ${a.lastName}`.trim()).join(", ")
      + (pageMeta.authors.length > 3 ? " et al." : "");
    $("paper-meta").textContent = [authorStr, pageMeta.date, pageMeta.journal].filter(Boolean).join(" · ");
  } else {
    $("paper-title").textContent = "No paper detected on this page";
    $("paper-meta").textContent = "Save this paper to Zotero using the Zotero Connector first, then click this button.";
  }

  // ── Latest Zotero item ──
  if (zoteroResult.status === "fulfilled") {
    zoteroItem = zoteroResult.value;
    const d = zoteroItem.data;
    $("zotero-title").textContent = d.title || "(untitled)";
    const zAuthors = (d.creators || []).slice(0, 3)
      .map(c => `${c.firstName || ""} ${c.lastName || ""}`.trim()).join(", ")
      + ((d.creators || []).length > 3 ? " et al." : "");
    $("zotero-meta").textContent = [zAuthors, d.date].filter(Boolean).join(" · ");

    // Block and hide Zotero section if no paper detected, or titles don't match
    const noPagePaper = !pageMeta;
    const titleMismatch = pageMeta && d.title && !titlesSimilar(pageMeta.title, d.title);
    if (noPagePaper || titleMismatch) {
      $("zotero-match-section").classList.add("hidden");
      $("mismatch-warn").classList.remove("hidden");
      $("add-btn").disabled = true;
    }
  } else {
    $("zotero-title").textContent = "Could not fetch Zotero library";
    $("zotero-meta").textContent = zoteroResult.reason?.message || "";
    $("add-btn").disabled = true;
  }

  // ── Button ──
  const addBtn = $("add-btn");
  const newBtn = addBtn.cloneNode(true);
  addBtn.parentNode.replaceChild(newBtn, addBtn);

  newBtn.addEventListener("click", async () => {
    if (!zoteroItem) return;
    newBtn.disabled = true;

    try {
      // Re-read page content for the summary — skip content script on PDF pages
      setStep("step-read", "active", "⏳");
      let freshMeta = pageMeta;
      if (tab?.id && !isPdfUrl) {
        freshMeta = await getPageMeta(tab.id).catch(() => pageMeta);
      }
      setStep("step-read", "done", "✓");

      setStep("step-summarise", "active", "⏳");
      const summary = await generateSummary(freshMeta || { title: zoteroItem.data.title, abstract: "", bodyText: "" }, claudeApiKey);
      setStep("step-summarise", "done", "✓");

      await chrome.storage.local.set({
        lastSummary: {
          title: zoteroItem.data.title,
          authors: zoteroItem.data.creators || [],
          date: zoteroItem.data.date || "",
          arxivId: freshMeta?.arxivId || null,
          journal: freshMeta?.journal || zoteroItem.data.publicationTitle || "",
          url: freshMeta?.url || "",
          summaryHtml: summary
        }
      });

      setStep("step-zotero", "active", "⏳");
      await attachNote(zoteroUserId, zoteroApiKey, zoteroItem.key, summary);
      setStep("step-zotero", "done", "✓");

      setTimeout(() => {
        mainPanel = "state-success";
        showPanel("state-success");
        $("view-summary-btn").addEventListener("click", () => {
          chrome.tabs.create({ url: chrome.runtime.getURL("summary.html") });
        });
      }, 400);

    } catch (e) {
      ["step-read", "step-summarise", "step-zotero"].forEach(id => {
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
