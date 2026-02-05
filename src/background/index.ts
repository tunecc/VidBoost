console.log('[VideoTools-Pro] Background script loaded');

// Relay for Cross-Tab Sync (Works across origins)
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'BROADCAST_SYNC') {
        // Relay to all tabs except the sender
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                if (tab.id && tab.id !== sender.tab?.id) {
                    chrome.tabs.sendMessage(tab.id, message.payload).catch(() => {
                        // Ignore errors from tabs that don't have the content script
                    });
                }
            }
        });
    }
});

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});
