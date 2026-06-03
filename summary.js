chrome.storage.local.get("lastSummary", ({ lastSummary }) => {
  if (!lastSummary) {
    document.getElementById("title").textContent = "No summary found.";
    return;
  }
  document.title = lastSummary.title;
  document.getElementById("title").textContent = lastSummary.title;

  const authorStr = (lastSummary.authors || [])
    .slice(0, 5)
    .map(a => `${a.firstName} ${a.lastName}`.trim())
    .join(", ") + (lastSummary.authors?.length > 5 ? " et al." : "");

  const pubLabel = lastSummary.arxivId
    ? `arXiv:${lastSummary.arxivId}`
    : lastSummary.journal || "";
  const linkUrl = lastSummary.url || (lastSummary.arxivId ? `https://arxiv.org/abs/${lastSummary.arxivId}` : "#");
  document.getElementById("meta").innerHTML =
    `${authorStr ? authorStr + " · " : ""}${lastSummary.date || ""}${pubLabel ? ' · <a href="' + linkUrl + '" target="_blank">' + pubLabel + "</a>" : ""}`;

  document.getElementById("summary").innerHTML = lastSummary.summaryHtml;
});
