chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  const url = new URL(tab.url);
  if (url.origin === "https://www.linkedin.com") {
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel.html",
      enabled: true
    });
  }
});

// Background message listener for hidden tab lifecycle management
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Spawn a hidden (inactive) tab for background deep-dive scraping
  if (message.type === "START_BACKGROUND_DEEP_DIVE") {
    console.log("[JobOrchestrator Pro BG] Spawning hidden tab for:", message.companyUrl);
    chrome.tabs.create({ url: message.companyUrl, active: false }, (tab) => {
      console.log(`[JobOrchestrator Pro BG] Hidden tab created with ID: ${tab.id}`);
      sendResponse({ success: true, tabId: tab.id });
    });
    return true; // Keep message channel open for async sendResponse
  }

  // Self-cleanup: close the hidden tab once scraping is complete
  if (message.type === "CLOSE_HIDDEN_TAB") {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      console.log(`[JobOrchestrator Pro BG] Closing hidden tab ID: ${tabId}`);
      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
          console.warn("[JobOrchestrator Pro BG] Tab already closed or error:", chrome.runtime.lastError.message);
        }
      });
    }
    sendResponse({ success: true });
    return false;
  }
});
