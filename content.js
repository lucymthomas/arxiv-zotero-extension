// Content script — runs in the page context, extracts paper metadata and body text.
// Called from popup.js via chrome.tabs.sendMessage.

function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
  return el ? el.getAttribute("content") : null;
}

function getAllMeta(name) {
  return [...document.querySelectorAll(`meta[name="${name}"]`)]
    .map(el => el.getAttribute("content"))
    .filter(Boolean);
}

function extractMetadata() {
  // ── Title ──
  const title =
    getMeta("citation_title") ||
    getMeta("og:title") ||
    getMeta("dc.title") ||
    document.title.replace(/\s*[|\-–]\s*.+$/, "").trim() ||
    "";

  // ── Authors ──
  const rawAuthors = getAllMeta("citation_author");
  const authors = rawAuthors.map(raw => {
    const parts = raw.split(",").map(s => s.trim());
    return parts.length === 2
      ? { creatorType: "author", firstName: parts[1], lastName: parts[0] }
      : { creatorType: "author", firstName: "", lastName: raw };
  });

  // ── Abstract ──
  const abstract =
    getMeta("citation_abstract") ||
    getMeta("og:description") ||
    getMeta("dc.description") ||
    getMeta("description") ||
    (() => {
      const el = document.querySelector(
        ".abstract, #abstract, [class*='abstract'] p, section.abstract p"
      );
      return el ? el.textContent.trim() : "";
    })();

  // ── DOI ──
  const doi =
    getMeta("citation_doi") ||
    getMeta("dc.identifier") ||
    (() => {
      const m = document.URL.match(/10\.\d{4,}\/[^\s"<>]+/);
      return m ? m[0] : null;
    })();

  // ── Journal / publication info ──
  const journal   = getMeta("citation_journal_title") || getMeta("og:site_name") || "";
  const volume    = getMeta("citation_volume") || "";
  const issue     = getMeta("citation_issue") || "";
  const pages     = getMeta("citation_firstpage")
    ? getMeta("citation_firstpage") + (getMeta("citation_lastpage") ? "–" + getMeta("citation_lastpage") : "")
    : getMeta("citation_pages") || "";
  const date      = (getMeta("citation_publication_date") || getMeta("citation_online_date") || "").replace(/\//g, "-");

  // ── arXiv ID ──
  const arxivMatch = document.URL.match(/arxiv\.org\/(?:abs|pdf|html)\/([^\/?#]+(?:\/\d+)?)/i)
    || (getMeta("citation_arxiv_id") || "").match(/(\d{4}\.\d+|[a-z-]+\/\d+)/i);
  const arxivId = arxivMatch ? arxivMatch[1].replace(/v\d+$/, "") : null;

  // ── Item type ──
  const itemType = arxivId ? "preprint" : "journalArticle";

  // ── Full body text ──
  const bodyText = extractBodyText();

  return { title, authors, abstract, doi, journal, volume, issue, pages, date, arxivId, itemType, bodyText, url: document.URL };
}

function extractBodyText() {
  // Clone the document so we can remove noise without affecting the page
  const clone = document.cloneNode(true);

  // Remove elements that are not article content
  const noise = [
    "nav", "header", "footer", "aside", "script", "style", "noscript",
    ".references", "#references", ".ref-list", "#ref-list",
    ".sidebar", ".advertisement", ".ads", ".cookie-banner",
    ".article-tools", ".article-metrics", ".social-share",
    ".citation-tools", ".figures-list", ".supplemental",
    "[class*='nav']", "[class*='menu']", "[class*='footer']", "[class*='header']",
    "[aria-label='navigation']", "[role='navigation']", "[role='banner']", "[role='contentinfo']"
  ];
  noise.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  // Try known article body selectors in priority order
  const candidates = [
    "article",
    "main article",
    ".article-body",
    ".article-content",
    ".fulltext-view",
    ".full-text",
    "#article-body",
    "#fulltext",
    ".ltx_document",          // arXiv HTML
    ".aps-full-text",         // APS
    ".NLM_paragraph",         // PubMed/PMC
    "[class*='article-body']",
    "[class*='fulltext']",
    "main",
    "#main-content",
    ".content"
  ];

  let bodyEl = null;
  for (const sel of candidates) {
    bodyEl = clone.querySelector(sel);
    if (bodyEl && bodyEl.textContent.trim().length > 200) break;
  }

  if (!bodyEl) bodyEl = clone.body;

  const text = bodyEl.textContent
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000); // cap at ~12k chars to keep prompt reasonable

  return text;
}

// Listen for message from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "GET_PAPER_METADATA") {
    try {
      sendResponse({ success: true, data: extractMetadata() });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
  return true; // keep channel open for async response
});
