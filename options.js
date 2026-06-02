const input = document.getElementById("api-key");
const saveBtn = document.getElementById("save-btn");
const savedMsg = document.getElementById("saved-msg");
const toggleShow = document.getElementById("toggle-show");

// Load saved key
chrome.storage.sync.get("claudeApiKey", ({ claudeApiKey }) => {
  if (claudeApiKey) input.value = claudeApiKey;
});

toggleShow.addEventListener("click", () => {
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  toggleShow.textContent = isPassword ? "Hide" : "Show";
});

saveBtn.addEventListener("click", () => {
  const key = input.value.trim();
  chrome.storage.sync.set({ claudeApiKey: key }, () => {
    savedMsg.style.display = "block";
    setTimeout(() => { savedMsg.style.display = "none"; }, 2000);
  });
});
