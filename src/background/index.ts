console.log('[VideoTools-Pro] Background script loaded');

// Enable session storage access from content scripts
chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
});

// --- Lightweight playback state tracker ---
// Foundation for centralized arbitration. Content scripts report state;
// background maintains a single source of truth for "who is playing".
type PlaybackEntry = {
    tabId: number;
    timestamp: number;
};

const playbackTracker = {
    activeTab: null as PlaybackEntry | null,
    userFocusedTab: null as PlaybackEntry | null,
};

// Relay for Cross-Tab Sync (Works across origins)
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'BROADCAST_SYNC') {
        // Track play signals in the arbitration state
        if (message.payload?.type === 'PLAY_STARTED' && sender.tab?.id) {
            playbackTracker.activeTab = {
                tabId: sender.tab.id,
                timestamp: Date.now()
            };
        }

        // Relay to all tabs except the sender
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                if (tab.id && tab.id !== sender.tab?.id) {
                    chrome.tabs.sendMessage(tab.id, message.payload).catch(() => {});
                }
            }
        });
    } else if (message.type === 'VB_PLAYBACK_STATE') {
        if (sender.tab?.id && message.state === 'stopped') {
            if (playbackTracker.activeTab?.tabId === sender.tab.id) {
                playbackTracker.activeTab = null;
            }
        }
    } else if (message.type === 'VB_USER_FOCUSED') {
        if (sender.tab?.id) {
            playbackTracker.userFocusedTab = {
                tabId: sender.tab.id,
                timestamp: Date.now()
            };
        }
    }
});

// Clean up tracker when tabs are removed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (playbackTracker.activeTab?.tabId === tabId) {
        playbackTracker.activeTab = null;
    }
    if (playbackTracker.userFocusedTab?.tabId === tabId) {
        playbackTracker.userFocusedTab = null;
    }
});

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});
